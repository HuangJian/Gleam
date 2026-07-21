import type { ObservationContext } from '../observation-context'
import { LLMError } from '../../gateway/llm-provider'
import { logger } from '../../util/logger'

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

// ── LLM retry helper ─────────────────────────────────────

/**
 * Immediate retry delays (ms) for transient LLM failures.
 *
 * These are in-process retries within a single Pipeline run, separate
 * from the Scheduler's exponential backoff schedule. Only retryable
 * errors (429, 5xx, network) trigger immediate retry; non-retryable
 * errors (401, 404) fail immediately.
 */
const IMMEDIATE_RETRY_DELAYS = [1_000, 2_000]

/**
 * Wraps an async LLM call with immediate retry for transient failures.
 *
 * Retries up to `IMMEDIATE_RETRY_DELAYS.length` times, but only when
 * the thrown error is an `LLMError` with `retryable = true`. All other
 * errors (non-retryable `LLMError`, generic `Error`) are re-thrown
 * immediately.
 *
 * Returns the result on success, or throws the last error on exhaustion.
 */
export async function withLLMRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= IMMEDIATE_RETRY_DELAYS.length; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const retryable = e instanceof LLMError && e.retryable
      if (!retryable || attempt >= IMMEDIATE_RETRY_DELAYS.length) {
        throw e
      }
      const delay = IMMEDIATE_RETRY_DELAYS[attempt]
      logger.debug('LLM call failed, retrying', {
        attempt: attempt + 1,
        delayMs: delay,
        error: e instanceof Error ? e.message : String(e),
      })
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}
