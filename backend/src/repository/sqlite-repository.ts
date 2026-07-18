import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import type { DB } from '../database'
import type { Database } from 'bun:sqlite'
import { gleams, gleamDerived } from '../database/schema'
import type { Gleam, GleamDerived, Source } from '../domain/gleam'
import { validateUuidV7 } from '../util/uuid'
import type {
  AppendError,
  AppendResult,
  IRepository,
  SearchHit,
  SearchResult,
  TimelineOptions,
  TimelineResult,
} from './repository'
import { generateHighlight } from '../search/highlight'
import { parseQuery, evaluateQuery, extractKeywords, QueryParseError } from '@gleam/shared/query'

const MAX_BATCH_SIZE = 100

export class SqliteRepository implements IRepository {
  private readonly db: DB
  private readonly sqlite: Database

  constructor(db: DB, sqlite: Database) {
    this.db = db
    this.sqlite = sqlite
  }

  // ── Append (core + derived) ──────────────────────────

  async appendGleams(
    inputGleams: Gleam[],
    _source: 'CAPTURE' | 'IMPORT' = 'CAPTURE',
  ): Promise<AppendResult> {
    if (inputGleams.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE}`)
    }

    let accepted = 0
    let skipped = 0
    let rejected = 0
    const errors: AppendError[] = []

    const tx = this.sqlite.transaction(() => {
      for (const gleam of inputGleams) {
        try {
          validateUuidV7(gleam.id)

          const existing = this.db
            .select({ id: gleams.id })
            .from(gleams)
            .where(eq(gleams.id, gleam.id))
            .get()

          const content = JSON.stringify(gleam)
          const sourceJson = JSON.stringify(gleam.source)
          const receivedAt = new Date().toISOString()

          if (existing) {
            skipped++
            this.upsertDerived(gleam.id, {
              tags: gleam.tags,
              revisitCount: gleam.revisitCount,
              lastRevisitedAt: gleam.lastRevisitedAt,
            })
            this.refreshFts(gleam.id, gleam.thought, gleam.source, gleam.tags)
          } else {
            this.db
              .insert(gleams)
              .values({
                id: gleam.id,
                createdAt: gleam.createdAt,
                thought: gleam.thought,
                source: sourceJson,
                content,
                receivedAt,
              })
              .run()

            this.db
              .insert(gleamDerived)
              .values({
                gleamId: gleam.id,
                tags: JSON.stringify(gleam.tags),
                revisitCount: gleam.revisitCount,
                lastRevisitedAt: gleam.lastRevisitedAt,
              })
              .run()

            accepted++
            this.refreshFts(gleam.id, gleam.thought, gleam.source, gleam.tags)
          }
        } catch (e) {
          rejected++
          errors.push({
            id: gleam.id ?? null,
            message: e instanceof Error ? e.message : String(e),
          })
        }
      }
    })

    tx()
    return { accepted, skipped, rejected, errors }
  }

  // ── Derived sync ─────────────────────────────────────

  async updateGleamDerivedFields(
    gleamId: string,
    updates: Partial<GleamDerived>,
  ): Promise<{ gleamId: string; success: boolean }> {
    const existing = this.db
      .select({ id: gleams.id, thought: gleams.thought, source: gleams.source })
      .from(gleams)
      .where(eq(gleams.id, gleamId))
      .get()

    if (!existing) {
      return { gleamId, success: false }
    }

    const current = this.db
      .select()
      .from(gleamDerived)
      .where(eq(gleamDerived.gleamId, gleamId))
      .get()

    const nextTags = updates.tags ?? (current ? (JSON.parse(current.tags) as string[]) : [])
    const nextRevisitCount = updates.revisitCount ?? current?.revisitCount ?? 0
    const nextLastRevisitedAt = updates.lastRevisitedAt ?? current?.lastRevisitedAt ?? ''

    this.db
      .insert(gleamDerived)
      .values({
        gleamId,
        tags: JSON.stringify(nextTags),
        revisitCount: nextRevisitCount,
        lastRevisitedAt: nextLastRevisitedAt,
      })
      .onConflictDoUpdate({
        target: gleamDerived.gleamId,
        set: {
          tags: JSON.stringify(nextTags),
          revisitCount: nextRevisitCount,
          lastRevisitedAt: nextLastRevisitedAt,
        },
      })
      .run()

    const source = JSON.parse(existing.source) as Source
    this.refreshFts(gleamId, existing.thought, source, nextTags)

    return { gleamId, success: true }
  }

  // ── Tag rename ───────────────────────────────────────

  async renameTag(oldTag: string, newTag: string): Promise<{ affectedCount: number }> {
    const normalizedOld = oldTag.trim()
    const normalizedNew = newTag.trim()
    if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) {
      return { affectedCount: 0 }
    }

    let affectedCount = 0
    const tx = this.sqlite.transaction(() => {
      const allDerived = this.db.select().from(gleamDerived).all()
      for (const row of allDerived) {
        const tags: string[] = JSON.parse(row.tags)
        if (!tags.includes(normalizedOld)) continue
        const next = Array.from(
          new Set(tags.filter((t) => t !== normalizedOld).concat(normalizedNew)),
        )
        this.db
          .update(gleamDerived)
          .set({ tags: JSON.stringify(next) })
          .where(eq(gleamDerived.gleamId, row.gleamId))
          .run()

        const core = this.db
          .select({ thought: gleams.thought, source: gleams.source })
          .from(gleams)
          .where(eq(gleams.id, row.gleamId))
          .get()
        if (core) {
          const source = JSON.parse(core.source) as Source
          this.refreshFts(row.gleamId, core.thought, source, next)
        }
        affectedCount++
      }
    })
    tx()
    return { affectedCount }
  }

  // ── Timeline ─────────────────────────────────────────

  async getTimeline(options: TimelineOptions): Promise<TimelineResult> {
    const limit = options.limit ?? 50
    const offset = options.offset ?? 0

    const conditions = []
    if (options.from) {
      conditions.push(gte(gleams.createdAt, options.from))
    }
    if (options.to) {
      conditions.push(lte(gleams.createdAt, options.to))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const totalResult = this.db
      .select({ count: sql<number>`count(*)` })
      .from(gleams)
      .where(whereClause)
      .get()
    const total = totalResult?.count ?? 0

    const rows = this.db
      .select()
      .from(gleams)
      .where(whereClause)
      .orderBy(desc(gleams.createdAt))
      .limit(limit)
      .offset(offset)
      .all()

    const items = rows.map((row) => this.joinGleam(row))
    const hasMore = offset + items.length < total

    return { items, total, hasMore }
  }

  // ── Search ───────────────────────────────────────────
  //
  // Uses the shared query language (shared/query.ts) to evaluate the query
  // against all gleams in TypeScript. This supports the full query syntax
  // (#tag, domain:, date operators, boolean logic, periods) identically on
  // both client and backend.
  //
  // For Gleam's expected scale (thousands of gleams), loading all rows and
  // filtering in TS is in the millisecond range. The FTS5 index is retained
  // in the schema but not used for search — it can be re-engaged later if
  // data volume grows significantly.

  async search(query: string, limit: number = 20, offset: number = 0): Promise<SearchResult> {
    // Mirror the client's runQuery: a malformed query (e.g. a bare "#"
    // with no value) throws QueryParseError. Instead of surfacing it as a
    // hard GraphQLError, fall back to a plain free-text match over the raw
    // input so the search box never breaks.
    let ast: ReturnType<typeof parseQuery>
    try {
      ast = parseQuery(query)
    } catch (e) {
      if (e instanceof QueryParseError) {
        ast = { kind: 'keyword', value: query }
      } else {
        throw e
      }
    }
    if (!ast) {
      return { total: 0, items: [] }
    }

    // Load all gleams (join core + derived), newest first.
    const allRows = this.db.select().from(gleams).orderBy(desc(gleams.createdAt)).all()
    const allGleams = allRows.map((row) => this.joinGleam(row))

    // Filter using the shared query evaluator.
    const matched = evaluateQuery(ast, allGleams)

    const total = matched.length
    const items = matched.slice(offset, offset + limit)

    // Generate highlights from keyword nodes only (not filter values).
    const keywords = extractKeywords(ast)
    const hits: SearchHit[] = items.map((gleam) => ({
      gleam,
      score: 1,
      highlight:
        keywords.length > 0
          ? generateHighlight(keywords, [
              { text: gleam.thought, weight: 10 },
              { text: gleam.source.title, weight: 6 },
              { text: gleam.source.excerpt, weight: 2 },
            ])
          : null,
    }))

    return { total, items: hits }
  }

  // ── Single gleam ─────────────────────────────────────

  async getGleamById(id: string): Promise<Gleam | null> {
    const row = this.db.select().from(gleams).where(eq(gleams.id, id)).get()
    if (!row) return null
    return this.joinGleam(row)
  }

  // ── Helpers ──────────────────────────────────────────

  private joinGleam(row: typeof gleams.$inferSelect): Gleam {
    const source = JSON.parse(row.source) as Source
    const derived = this.db
      .select()
      .from(gleamDerived)
      .where(eq(gleamDerived.gleamId, row.id))
      .get()

    return {
      id: row.id,
      thought: row.thought,
      source,
      createdAt: row.createdAt,
      tags: derived ? (JSON.parse(derived.tags) as string[]) : [],
      revisitCount: derived?.revisitCount ?? 0,
      lastRevisitedAt: derived?.lastRevisitedAt ?? '',
    }
  }

  private upsertDerived(gleamId: string, derived: GleamDerived): void {
    this.db
      .insert(gleamDerived)
      .values({
        gleamId,
        tags: JSON.stringify(derived.tags),
        revisitCount: derived.revisitCount,
        lastRevisitedAt: derived.lastRevisitedAt,
      })
      .onConflictDoUpdate({
        target: gleamDerived.gleamId,
        set: {
          tags: JSON.stringify(derived.tags),
          revisitCount: derived.revisitCount,
          lastRevisitedAt: derived.lastRevisitedAt,
        },
      })
      .run()
  }

  private refreshFts(gleamId: string, thought: string, source: Source, tags: string[]): void {
    this.sqlite.prepare(`DELETE FROM gleams_fts WHERE gleam_id = ?`).run(gleamId)
    this.sqlite
      .prepare(
        `INSERT INTO gleams_fts (gleam_id, thought, source_title, source_excerpt, source_url, tags)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        gleamId,
        thought,
        source.title ?? '',
        source.excerpt ?? '',
        source.url ?? '',
        tags.join(' '),
      )
  }
}
