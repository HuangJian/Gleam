import type { ObservationContext } from '../observation-context'

/**
 * Result of running one stage.
 *
 *   success  — artifact generated; context updated.
 *   skipped  — dependencies unmet; stage did not run.
 *   failed   — computation failed; failure recorded for retry.
 */
export type StageOutcome = 'success' | 'skipped' | 'failed'

/**
 * One Observation Stage owns exactly one semantic artifact.
 *
 * Stages are independent: a stage never modifies artifacts owned by
 * other stages. This separation allows every semantic capability to
 * evolve independently.
 *
 * Stage execution order is defined by the Pipeline, not by the stages
 * themselves. Stages declare their dependencies; the Pipeline honors
 * them.
 *
 * Implementations must:
 *   1. Check whether the artifact is already completed (idempotent).
 *   2. Verify dependencies (e.g. Relation needs Embedding).
 *   3. Set status to 'running' before calling the provider.
 *   4. On success: persist the artifact and set status to 'completed'.
 *   5. On failure: record the failure (retry counter++) and return 'failed'.
 *
 * Stages catch their own errors and return 'failed' rather than throwing.
 * The Pipeline uses the return value to decide whether to run dependent
 * stages (e.g. skip Relation if Embedding failed).
 */
export interface ObservationStage {
  /** Semantic artifact this stage owns. */
  readonly artifact: 'summary' | 'tags' | 'embedding' | 'relation'

  /** Run the stage against the observation context. */
  execute(ctx: ObservationContext): Promise<StageOutcome>
}
