import type { Gleam, GleamDerived } from '../domain/gleam'

// ── Types ───────────────────────────────────────────────

export interface TimelineOptions {
  limit?: number
  offset?: number
  from?: string
  to?: string
}

export interface TimelineResult {
  items: Gleam[]
  total: number
  hasMore: boolean
}

export interface SearchResult {
  total: number
  items: SearchHit[]
}

export interface SearchHit {
  gleam: Gleam
  score: number
  highlight: string | null
}

export interface AppendResult {
  accepted: number
  skipped: number
  rejected: number
  errors: AppendError[]
}

export interface AppendError {
  id: string | null
  message: string
}

// ── IRepository ─────────────────────────────────────────

export interface IRepository {
  appendGleams(gleams: Gleam[], source?: 'CAPTURE' | 'IMPORT'): Promise<AppendResult>
  updateGleamDerivedFields(
    gleamId: string,
    updates: Partial<GleamDerived>,
  ): Promise<{ gleamId: string; success: boolean }>
  renameTag(oldTag: string, newTag: string): Promise<{ affectedCount: number }>
  getTimeline(options: TimelineOptions): Promise<TimelineResult>
  search(query: string, limit?: number, offset?: number): Promise<SearchResult>
  getGleamById(id: string): Promise<Gleam | null>
}
