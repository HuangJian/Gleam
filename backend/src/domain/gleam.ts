import { type } from 'arktype'

// ── Source ──────────────────────────────────────────────

export const SourceTypeSchema = type("'url' | 'book' | 'conversation' | 'experience' | 'thought'")
export const MediaKindSchema = type("'image' | 'audio' | 'video'")

export const SourceMediaSchema = type({
  kind: MediaKindSchema,
  src: 'string.url',
})

export const SourceSchema = type({
  type: SourceTypeSchema,
  url: 'string >= 0',
  title: 'string',
  excerpt: 'string',
  'media?': SourceMediaSchema,
})

// ── Gleam (core) ────────────────────────────────────────

export const GleamCoreSchema = type({
  id: 'string',
  createdAt: 'string',
  thought: 'string',
  source: SourceSchema,
})

// ── Gleam (derived) ─────────────────────────────────────

export const GleamDerivedSchema = type({
  tags: 'string[]',
  revisitCount: 'number >= 0',
  lastRevisitedAt: 'string',
})

// Full Gleam = core + derived
export const GleamSchema = GleamCoreSchema.and(GleamDerivedSchema)

// ── Infrastructure metadata (not part of domain model) ──

export interface StoredGleam {
  core: typeof GleamCoreSchema.infer
  content: string
  receivedAt: string
}

export interface StoredDerived {
  gleamId: string
  tags: string[]
  revisitCount: number
  lastRevisitedAt: string
}

// ── Types ───────────────────────────────────────────────

export type Gleam = typeof GleamSchema.infer
export type GleamCore = typeof GleamCoreSchema.infer
export type GleamDerived = typeof GleamDerivedSchema.infer
export type Source = typeof SourceSchema.infer
export type SourceType = typeof SourceTypeSchema.infer
export type MediaKind = typeof MediaKindSchema.infer
export type SourceMedia = typeof SourceMediaSchema.infer

// ── Validation helpers ──────────────────────────────────

/** Validates and normalizes a Gleam input, applying defaults for derived fields. */
export function normalizeGleam(input: Record<string, unknown>): Gleam {
  const source = (input.source ?? {}) as Record<string, unknown>
  const normalized = {
    id: input.id as string,
    thought: input.thought as string,
    source: {
      type: source.type as 'url' | 'book' | 'conversation' | 'experience' | 'thought',
      url: (source.url as string) ?? '',
      title: (source.title as string) ?? '',
      excerpt: (source.excerpt as string) ?? '',
      media: source.media as SourceMedia | undefined,
    },
    createdAt: input.createdAt as string,
    tags: (input.tags as string[]) ?? [],
    revisitCount: (input.revisitCount as number) ?? 0,
    lastRevisitedAt: (input.lastRevisitedAt as string) ?? '',
  }

  const result = GleamSchema(normalized)
  if (result instanceof type.errors) {
    throw new Error(`Gleam validation failed: ${result.summary}`)
  }
  return result
}
