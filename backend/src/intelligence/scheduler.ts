import type { IIntelligenceRepository, IRepository } from '../repository/repository'
import type { LLMProvider } from '../gateway/llm-provider'
import type { ObservationPipeline } from './pipeline'
import { createProvider } from '../gateway'
import { logger } from '../util/logger'

/**
 * Scheduler — continuously observes the Repository for pending semantic
 * work.
 *
 * Unlike GraphQL requests, Scheduler execution is autonomous. It does
 * not consume a dedicated task queue — it derives work directly from
 * Repository state (the existence and processing state of `gleam_ai`
 * rows define what remains to be observed).
 *
 * Polling strategy (Version 1):
 *
 *   Scan → Claim → Observe → Persist → Sleep
 *
 * Every fixed interval (default 30s), the Scheduler performs one
 * observation cycle:
 *
 *   1. Discover Gleams that have no `gleam_ai` row yet → create them.
 *   2. Discover artifacts whose status is `pending` or retryable
 *      `failed` → process them.
 *   3. For each pending artifact, run the Observation Pipeline.
 *
 * Observation Lock:
 *   Version 1 executes only one observation cycle at a time. If one
 *   cycle is still running when the next polling interval arrives,
 *   the new cycle is skipped.
 *
 * Provider Not Configured:
 *   When no provider configuration exists, the Scheduler skips the
 *   observation cycle entirely. All pending artifacts remain in their
 *   current state — none transition to Failed.
 *
 * Recovery:
 *   During startup, the Scheduler scans for stale `running` records
 *   and resets them to `pending`. No manual recovery is required.
 */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(
    private readonly intelligenceRepo: IIntelligenceRepository,
    private readonly gleamRepo: IRepository,
    private readonly pipeline: ObservationPipeline,
    private readonly intervalMs: number,
    private readonly batchSize: number,
  ) {}

  /**
   * Start the polling loop. Called once at backend startup.
   *
   * Startup sequence:
   *   1. Recover stale `running` observations → `pending`.
   *   2. Begin polling.
   */
  start(): void {
    if (this.timer) return

    // Fire-and-forget recovery; the polling loop will pick up work
    // once recovery completes.
    this.recover().catch((e) => {
      logger.error('Scheduler recovery failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    })

    this.timer = setInterval(() => {
      this.tick().catch((e) => {
        logger.error('Scheduler tick failed', {
          error: e instanceof Error ? e.message : String(e),
        })
      })
    }, this.intervalMs)

    logger.info('Scheduler started', {
      intervalMs: this.intervalMs,
      batchSize: this.batchSize,
    })
  }

  /** Stop the polling loop. Safe to call multiple times. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('Scheduler stopped')
    }
  }

  /**
   * Perform one observation cycle. Exposed publicly for testing —
   * unit tests invoke `tick()` directly without real timers.
   *
   * Returns the number of Gleams observed during this tick.
   */
  async tick(): Promise<number> {
    // Observation lock: skip if already running.
    //
    // `this.running` is set synchronously BEFORE any `await` to prevent
    // a race condition where two concurrent `tick()` calls both pass the
    // guard before either sets the flag.
    if (this.running) {
      logger.debug('Scheduler tick skipped — already running')
      return 0
    }

    this.running = true
    try {
      // Provider configured?
      const config = await this.intelligenceRepo.getIntelligenceConfig()
      if (!config) {
        logger.debug('Scheduler tick skipped — no provider configured')
        return 0
      }

      // ── Step 1: Discover unobserved Gleams ──
      const unobserved = await this.intelligenceRepo.findUnobservedGleams(this.batchSize)
      for (const gleamId of unobserved) {
        await this.intelligenceRepo.createGleamAI(gleamId)
      }
      if (unobserved.length > 0) {
        logger.debug('Created gleam_ai rows', { count: unobserved.length })
      }

      // ── Step 2: Discover pending artifacts ──
      const pending = await this.intelligenceRepo.findPendingArtifacts(this.batchSize)
      if (pending.length === 0) return 0

      // Group by gleamId to avoid observing the same Gleam twice in one tick.
      const gleamIds = Array.from(new Set(pending.map((p) => p.gleamId)))

      // ── Step 3: Observe ──
      let observed = 0
      let provider: LLMProvider
      try {
        provider = createProvider(config)
      } catch (e) {
        logger.error('Failed to construct provider; skipping tick', {
          error: e instanceof Error ? e.message : String(e),
        })
        return 0
      }

      for (const gleamId of gleamIds) {
        const gleam = await this.gleamRepo.getGleamById(gleamId)
        if (!gleam) continue
        try {
          await this.pipeline.observe(gleam, provider)
          observed++
        } catch (e) {
          logger.error('Pipeline observation failed', {
            gleamId,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }

      return observed
    } finally {
      this.running = false
    }
  }

  /**
   * Reset stale `running` observations back to `pending`.
   *
   * Unexpected backend termination may leave observations in the
   * Running state. During startup, the Scheduler safely returns them
   * to Pending before polling begins.
   */
  private async recover(): Promise<void> {
    const recovered = await this.intelligenceRepo.recoverRunningObservations()
    if (recovered > 0) {
      logger.info('Recovered stale running observations', { count: recovered })
    }
  }
}
