import type { Gleam } from './gleam'

/**
 * Client-side Intelligence types.
 *
 * These mirror the backend's GraphQL Intelligence fields without
 * extending the shared Gleam type. AI data is companion data —
 * it attaches to a Gleam for display purposes but does not
 * alter the core domain model.
 */

/** AI-derived observation attached to a Gleam. */
export interface GleamIntelligence {
  /** AI-generated summary. null when not yet generated. */
  summary: string | null
  /**
   * AI-generated tags (already filtered by removed_tags by the backend).
   * A tag may appear in both `Gleam.tags` (visible set) and here —
   * see "Tag Provenance" in the plan §8.1 for display priority rules.
   */
  aiTags: string[]
}

/**
 * A semantic relation between two Gleams.
 *
 * Mirrors the backend's GraphQL `GleamRelation` type, including
 * the nested `targetGleam` object (NOT a flat ID — the backend
 * resolver returns a full Gleam inside `targetGleam`).
 */
export interface GleamRelation {
  id: string
  /** Nested target Gleam (matches backend GraphQL response shape). */
  targetGleam: {
    id: string
    thought: string
    createdAt: string
  }
  relationType: string
  /** Cosine similarity (0–1). null for user-created relations. */
  strength: number | null
  /** Lowercase on the client; GraphQL wire format is uppercase. */
  origin: 'ai' | 'user'
}

/** Provider configuration view (API key never returned). */
export interface IntelligenceConfigView {
  provider: string
  model: string
  /** Resolved embedding model (provider default applied if unset). */
  embeddingModel: string
  endpoint: string
  hasApiKey: boolean
}

/** Which semantic artifact to regenerate. */
export type ArtifactType = 'SUMMARY' | 'TAGS' | 'EMBEDDING' | 'RELATION'

/**
 * A Gleam with its AI companion data.
 *
 * This is the single composite type used throughout the UI layer.
 * `TimelineResult.items`, `SearchResult.items`, and `viewingGleam`
 * all use this type — there is no separate `TimelineItem` type.
 */
export interface GleamWithIntelligence {
  gleam: Gleam
  intelligence: GleamIntelligence
}
