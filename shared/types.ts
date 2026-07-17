// ── Source ──────────────────────────────────────────────

export type SourceType = 'url' | 'book' | 'conversation' | 'experience' | 'thought'

export type MediaKind = 'image' | 'audio' | 'video'

export interface SourceMedia {
  kind: MediaKind
  src: string
}

export interface Source {
  type: SourceType
  url: string // Default ''
  title: string // Default ''
  excerpt: string // Default ''
  media?: SourceMedia // Object reference; remains optional
}

// ── Gleam ───────────────────────────────────────────────

export interface Gleam {
  // Core fields — IMMUTABLE after creation
  id: string // UUID v7 (time-ordered)
  thought: string // User's understanding (never empty)
  source: Source // Reconstructable context
  createdAt: string // ISO 8601

  // Derived fields — MUTABLE
  tags: string[] // Non-optional, defaults to []
  revisitCount: number // Defaults to 0
  lastRevisitedAt: string // ISO 8601, defaults to '' (empty until first revisit)
}
