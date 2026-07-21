import type { Gleam, GleamDerived } from '../domain/gleam'
import type {
  ArtifactType,
  GleamAI,
  GleamRelation,
  IntelligenceConfig,
  IntelligenceConfigView,
  ObservationStatus,
  PendingArtifact,
  PromptSnapshot,
} from '../domain/gleam-ai'

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

  /**
   * Removes a tag from a Gleam.
   *
   * - If the tag exists in `gleam_derived.tags` (user-owned), it is removed
   *   from the user tag collection and recorded in `removed_tags`.
   * - If the tag exists only in `gleam_ai.tags` (AI-generated), it is added
   *   to `removed_tags` without modifying the AI observation itself.
   *
   * Either way, the tag is recorded in `removed_tags` so future AI
   * regeneration remains deterministic — even if the same tag is suggested
   * again, the user's previous rejection continues to take effect.
   */
  removeTag(gleamId: string, tag: string): Promise<{ gleamId: string; success: boolean }>
}

// ── IIntelligenceRepository ─────────────────────────────

/**
 * Persistence interface for the Intelligence subsystem.
 *
 * The Intelligence module never touches SQLite directly. Like every other
 * backend component, it communicates through this repository interface,
 * preserving the dependency direction established by `backend-v1.plan.md`.
 *
 * The existing `SqliteRepository` class implements both `IRepository` and
 * `IIntelligenceRepository`.
 */
export interface IIntelligenceRepository {
  // ── Observation lifecycle ──────────────────────────

  /** Discover Gleams that have no `gleam_ai` row yet. */
  findUnobservedGleams(limit: number): Promise<string[]>

  /** Discover artifacts whose status is `pending` or retryable `failed`. */
  findPendingArtifacts(limit: number): Promise<PendingArtifact[]>

  /** Create an empty `gleam_ai` row for a Gleam (all artifacts pending). */
  createGleamAI(gleamId: string): Promise<void>

  /** Reset stale `running` observations back to `pending` at startup. */
  recoverRunningObservations(): Promise<number>

  // ── Artifact updates ───────────────────────────────

  updateSummary(
    gleamId: string,
    summary: string,
    provider: string,
    model: string,
    promptVersion: string,
  ): Promise<void>

  updateTags(
    gleamId: string,
    tags: string[],
    provider: string,
    model: string,
    promptVersion: string,
  ): Promise<void>

  updateEmbedding(
    gleamId: string,
    embedding: Buffer,
    dimensions: number,
    provider: string,
    model: string,
  ): Promise<void>

  /** Mark the Relation Stage as complete (relations are stored separately). */
  updateRelationObservation(
    gleamId: string,
    provider: string,
    model: string,
    promptVersion: string,
  ): Promise<void>

  // ── Status management ──────────────────────────────

  setArtifactStatus(
    gleamId: string,
    artifact: ArtifactType,
    status: ObservationStatus,
  ): Promise<void>

  /** Record a failed attempt and increment the retry counter. */
  recordArtifactFailure(gleamId: string, artifact: ArtifactType): Promise<void>

  getGleamAI(gleamId: string): Promise<GleamAI | null>

  /**
   * Return the visible tag set for a Gleam:
   *   unique(userTags + aiTags) − removedTags
   */
  getVisibleTags(gleamId: string): Promise<{
    userTags: string[]
    aiTags: string[]
    removedTags: string[]
    visible: string[]
  }>

  // ── Relations ──────────────────────────────────────

  /**
   * Compute semantic similarity between a Gleam's embedding and every other
   * Gleam embedding in the Repository. Returns matches above `threshold`
   * sorted by descending similarity, limited to `limit` results.
   *
   * Embeddings with mismatched dimensions are skipped (incompatible spaces).
   */
  findSimilarGleams(
    gleamId: string,
    threshold: number,
    limit: number,
  ): Promise<Array<{ gleamId: string; similarity: number }>>

  /**
   * Atomically replace all AI-origin relations for `sourceGleamId` with
   * the provided set. User-created relations are never touched.
   */
  replaceAIRelations(
    sourceGleamId: string,
    relations: Array<{ targetGleamId: string; strength: number }>,
  ): Promise<void>

  getRelations(gleamId: string): Promise<GleamRelation[]>

  /**
   * Bulk-load embeddings for similarity computation. Returns rows with
   * the embedding BLOB and dimensions, excluding the Gleam itself.
   */
  getAllEmbeddings(excludeGleamId: string): Promise<
    Array<{
      gleamId: string
      embedding: Buffer
      dimensions: number | null
      embeddingModel: string | null
    }>
  >

  // ── Provider configuration ─────────────────────────

  getIntelligenceConfig(): Promise<IntelligenceConfig | null>
  saveIntelligenceConfig(config: IntelligenceConfig): Promise<void>
  removeIntelligenceConfig(): Promise<void>
  getIntelligenceConfigView(): Promise<IntelligenceConfigView | null>

  /**
   * Reset embedding (and, by dependency, relation) status to `pending` for
   * every Gleam. Used when the embedding model changes so the Scheduler
   * regenerates all embeddings against the new vector space. User-created
   * relations are untouched by the Relation stage.
   */
  resetAllEmbeddings(): Promise<void>

  // ── Prompt history ─────────────────────────────────

  savePromptSnapshot(
    capability: string,
    version: string,
    content: string,
    checksum: string,
  ): Promise<void>

  getPromptSnapshot(capability: string, version: string): Promise<PromptSnapshot | null>

  getPromptSnapshotsForCapability(capability: string): Promise<PromptSnapshot[]>
}
