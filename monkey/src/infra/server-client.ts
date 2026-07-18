import type { Gleam, Source, MediaKind, SourceType } from '../domain/gleam'

// ── GM_xmlhttpRequest declaration ──────────────────────

interface GMXHRResponse {
  responseText: string
  status: number
  statusText: string
}

interface GMXHRDetails {
  method: string
  url: string
  headers?: Record<string, string>
  data?: string
  timeout?: number
  onload?: (response: GMXHRResponse) => void
  onerror?: (error: unknown) => void
  ontimeout?: () => void
}

declare function GM_xmlhttpRequest(details: GMXHRDetails): void

// ── Types (mirror backend GraphQL types) ───────────────

export interface ServerConfig {
  url: string
}

export interface SearchHit {
  gleam: Gleam
  score: number
  highlight: string | null
}

export interface SearchResult {
  total: number
  items: SearchHit[]
}

export interface TimelineResult {
  items: Gleam[]
  total: number
  hasMore: boolean
}

export interface AppendResult {
  accepted: number
  skipped: number
  rejected: number
  errors: { id: string | null; message: string }[]
}

export interface TimelineOptions {
  limit?: number
  offset?: number
}

export type DerivedUpdates = Partial<Pick<Gleam, 'tags' | 'revisitCount' | 'lastRevisitedAt'>>

// ── GraphQL operation strings ──────────────────────────

const PING_QUERY = /* GraphQL */ `
  query Ping {
    timeline(input: { limit: 1 }) {
      total
    }
  }
`

const SEARCH_QUERY = /* GraphQL */ `
  query Search($query: String!, $limit: Int, $offset: Int) {
    search(input: { query: $query, limit: $limit, offset: $offset }) {
      total
      items {
        gleam {
          id
          thought
          source {
            type
            url
            title
            excerpt
            media {
              kind
              src
            }
          }
          createdAt
          tags
          revisitCount
          lastRevisitedAt
        }
        score
        highlight
      }
    }
  }
`

const TIMELINE_QUERY = /* GraphQL */ `
  query Timeline($limit: Int, $offset: Int) {
    timeline(input: { limit: $limit, offset: $offset }) {
      items {
        id
        thought
        source {
          type
          url
          title
          excerpt
          media {
            kind
            src
          }
        }
        createdAt
        tags
        revisitCount
        lastRevisitedAt
      }
      total
      hasMore
    }
  }
`

const APPEND_MUTATION = /* GraphQL */ `
  mutation AppendGleams($gleams: [GleamInput!]!, $source: UploadSource) {
    appendGleams(input: { gleams: $gleams, source: $source }) {
      accepted
      skipped
      rejected
      errors {
        id
        message
      }
    }
  }
`

const UPDATE_DERIVED_MUTATION = /* GraphQL */ `
  mutation UpdateDerivedFields(
    $gleamId: ID!
    $tags: [String!]
    $revisitCount: Int
    $lastRevisitedAt: DateTime
  ) {
    updateGleamDerivedFields(
      input: {
        gleamId: $gleamId
        tags: $tags
        revisitCount: $revisitCount
        lastRevisitedAt: $lastRevisitedAt
      }
    ) {
      gleamId
      success
    }
  }
`

const RENAME_TAG_MUTATION = /* GraphQL */ `
  mutation RenameTag($oldTag: String!, $newTag: String!) {
    renameTag(input: { oldTag: $oldTag, newTag: $newTag }) {
      affectedCount
    }
  }
`

// ── Conversion helpers ─────────────────────────────────
//
// GraphQL enums are uppercase (URL, BOOK, IMAGE, …) but the client domain
// model uses lowercase (url, book, image, …). The backend resolver converts
// back to lowercase internally, but the wire format is uppercase.
// lastRevisitedAt: '' (client) ↔ null (GraphQL wire).

function toGraphQLSource(source: Source): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: source.type.toUpperCase(),
    url: source.url,
    title: source.title,
    excerpt: source.excerpt,
  }
  if (source.media) {
    out.media = { kind: source.media.kind.toUpperCase(), src: source.media.src }
  }
  return out
}

function toGraphQLGleamInput(gleam: Gleam): Record<string, unknown> {
  return {
    id: gleam.id,
    thought: gleam.thought,
    source: toGraphQLSource(gleam.source),
    createdAt: gleam.createdAt,
    tags: gleam.tags,
    revisitCount: gleam.revisitCount,
    lastRevisitedAt: gleam.lastRevisitedAt === '' ? null : gleam.lastRevisitedAt,
  }
}

function fromGraphQLGleam(raw: Record<string, unknown>): Gleam {
  const sourceRaw = raw.source as Record<string, unknown>
  const mediaRaw = sourceRaw.media as Record<string, unknown> | undefined | null

  const source: Source = {
    type: (sourceRaw.type as string).toLowerCase() as SourceType,
    url: (sourceRaw.url as string) ?? '',
    title: (sourceRaw.title as string) ?? '',
    excerpt: (sourceRaw.excerpt as string) ?? '',
    media: mediaRaw
      ? { kind: (mediaRaw.kind as string).toLowerCase() as MediaKind, src: mediaRaw.src as string }
      : undefined,
  }

  // Remove media if undefined to match Source type (media is optional)
  if (!source.media) delete source.media

  return {
    id: raw.id as string,
    thought: raw.thought as string,
    source,
    createdAt: raw.createdAt as string,
    tags: (raw.tags as string[]) ?? [],
    revisitCount: (raw.revisitCount as number) ?? 0,
    lastRevisitedAt: (raw.lastRevisitedAt as string) ?? '',
  }
}

// ── ServerClient ───────────────────────────────────────

/**
 * GraphQL client that communicates with the Gleam backend via GM_xmlhttpRequest
 * (bypasses CORS). All methods throw on network errors or GraphQL errors.
 */
export class ServerClient {
  constructor(private getConfig: () => ServerConfig) {}

  /** Lightweight health check. Returns true if the server responds. */
  async ping(): Promise<boolean> {
    try {
      const resp = await this.request(PING_QUERY, {})
      return !resp.errors
    } catch {
      return false
    }
  }

  /** Uploads gleams to the server (appendGleams mutation). Idempotent on core. */
  async appendGleams(
    gleams: Gleam[],
    source: 'CAPTURE' | 'IMPORT' = 'CAPTURE',
  ): Promise<AppendResult> {
    const resp = await this.request(APPEND_MUTATION, {
      gleams: gleams.map(toGraphQLGleamInput),
      source,
    })
    const data = resp.data?.appendGleams as
      | {
          accepted: number
          skipped: number
          rejected: number
          errors: { id: string | null; message: string }[]
        }
      | undefined
    if (!data) throw new Error('Missing appendGleams in response')
    return {
      accepted: data.accepted,
      skipped: data.skipped,
      rejected: data.rejected,
      errors: (data.errors ?? []).map((e) => ({
        id: e.id ?? null,
        message: e.message,
      })),
    }
  }

  /** Searches gleams on the server. Returns gleams + highlights. */
  async search(query: string, limit = 20, offset = 0): Promise<SearchResult> {
    const resp = await this.request(SEARCH_QUERY, { query, limit, offset })
    const data = resp.data?.search as
      | {
          total: number
          items: { gleam: Record<string, unknown>; score: number; highlight: string | null }[]
        }
      | undefined
    if (!data) throw new Error('Missing search in response')
    return {
      total: data.total,
      items: (data.items ?? []).map((hit) => ({
        gleam: fromGraphQLGleam(hit.gleam),
        score: hit.score,
        highlight: hit.highlight ?? null,
      })),
    }
  }

  /** Fetches the timeline (all gleams, newest first). */
  async getTimeline(options: TimelineOptions = {}): Promise<TimelineResult> {
    const resp = await this.request(TIMELINE_QUERY, {
      limit: options.limit ?? 500,
      offset: options.offset ?? 0,
    })
    const data = resp.data?.timeline as
      | { items: Record<string, unknown>[]; total: number; hasMore: boolean }
      | undefined
    if (!data) throw new Error('Missing timeline in response')
    return {
      items: (data.items ?? []).map((g) => fromGraphQLGleam(g)),
      total: data.total,
      hasMore: data.hasMore,
    }
  }

  /** Updates derived fields on a gleam (updateGleamDerivedFields mutation). */
  async updateDerivedFields(gleamId: string, updates: DerivedUpdates): Promise<boolean> {
    const resp = await this.request(UPDATE_DERIVED_MUTATION, {
      gleamId,
      tags: updates.tags,
      revisitCount: updates.revisitCount,
      lastRevisitedAt: updates.lastRevisitedAt === '' ? null : updates.lastRevisitedAt,
    })
    const data = resp.data?.updateGleamDerivedFields as
      | { gleamId: string; success: boolean }
      | undefined
    if (!data) throw new Error('Missing updateGleamDerivedFields in response')
    return data.success
  }

  /** Renames a tag across all gleams (renameTag mutation). */
  async renameTag(oldTag: string, newTag: string): Promise<number> {
    const resp = await this.request(RENAME_TAG_MUTATION, { oldTag, newTag })
    const data = resp.data?.renameTag as { affectedCount: number } | undefined
    if (!data) throw new Error('Missing renameTag in response')
    return data.affectedCount
  }

  // ── Internal: GM_xmlhttpRequest wrapper ──────────────

  private async request(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<{ data?: Record<string, unknown>; errors?: unknown[] }> {
    const config = this.getConfig()
    const body = JSON.stringify({ query, variables })

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: config.url,
        headers: { 'Content-Type': 'application/json' },
        data: body,
        timeout: 10000,
        onload: (resp) => {
          if (resp.status >= 400) {
            reject(new Error(`HTTP ${resp.status}: ${resp.statusText}`))
            return
          }
          try {
            const parsed = JSON.parse(resp.responseText)
            resolve(parsed)
          } catch {
            reject(new Error(`Invalid JSON response: ${resp.responseText.slice(0, 200)}`))
          }
        },
        onerror: () => reject(new Error('Network error: failed to reach server')),
        ontimeout: () => reject(new Error('Request timeout: server did not respond within 10s')),
      })
    })
  }
}
