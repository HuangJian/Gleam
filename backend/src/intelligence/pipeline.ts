import type { IIntelligenceRepository } from '../repository/repository'
import type { LLMProvider } from '../gateway/llm-provider'
import type { PromptRegistry } from './prompt-registry'
import type { ObservationContext } from './observation-context'
import type { ObservationStage, StageOutcome } from './stages/stage'
import { EmbeddingStage } from './stages/embedding-stage'
import { SummaryStage } from './stages/summary-stage'
import { TagStage } from './stages/tag-stage'
import { RelationStage } from './stages/relation-stage'
import type { Gleam } from '../domain/gleam'
import { logger } from '../util/logger'

/**
 * Observation Pipeline — orchestrates the four semantic stages for one
 * Gleam observation cycle.
 *
 * The Pipeline defines **dependency ordering**, not strict execution
 * ordering. Version 1 executes every stage sequentially, but the
 * dependency graph intentionally permits future parallel execution:
 *
 *   Embedding ─┐
 *   Summary  ──┤  (parallel) → Relation
 *   Tag      ──┘
 *
 * Stage Independence:
 *   - Failure of one capability must not prevent others from progressing.
 *   - Each semantic artifact maintains its own lifecycle independently.
 *
 * Execution Strategy:
 *   1. Run Embedding, Summary, Tag (independent).
 *   2. Run Relation only if Embedding succeeded.
 *
 * The Pipeline never throws — failures are recorded per-artifact and
 * surfaced through stage return values.
 */
export class ObservationPipeline {
  private readonly repo: IIntelligenceRepository
  private readonly promptRegistry: PromptRegistry
  private readonly embeddingStage: EmbeddingStage
  private readonly summaryStage: SummaryStage
  private readonly tagStage: TagStage
  private readonly relationStage: RelationStage

  constructor(
    repo: IIntelligenceRepository,
    promptRegistry: PromptRegistry,
    relationThreshold: number,
    relationLimit: number,
  ) {
    this.repo = repo
    this.promptRegistry = promptRegistry
    this.embeddingStage = new EmbeddingStage(repo)
    this.summaryStage = new SummaryStage(repo)
    this.tagStage = new TagStage(repo)
    this.relationStage = new RelationStage(repo, relationThreshold, relationLimit)
  }

  /**
   * Run all stages for one Gleam.
   *
   * `gleam` is the immutable Repository data. `provider` is the LLM
   * gateway (already constructed from stored config). The Pipeline
   * loads the current `gleam_ai` row, builds the ObservationContext,
   * and runs the stages in dependency order.
   */
  async observe(gleam: Gleam, provider: LLMProvider): Promise<void> {
    const gleamAI = await this.repo.getGleamAI(gleam.id)

    const ctx: ObservationContext = {
      gleam,
      gleamAI,
      provider,
      promptRegistry: this.promptRegistry,
    }

    // ── Independent stages (run sequentially in V1) ──
    const embeddingOutcome = await this.runStage(this.embeddingStage, ctx)
    const summaryOutcome = await this.runStage(this.summaryStage, ctx)
    const tagOutcome = await this.runStage(this.tagStage, ctx)

    // ── Relation depends on Embedding ──
    let relationOutcome: StageOutcome = 'skipped'
    if (embeddingOutcome === 'success') {
      // Reload context to pick up the freshly-stored embedding.
      ctx.gleamAI = await this.repo.getGleamAI(gleam.id)
      relationOutcome = await this.runStage(this.relationStage, ctx)
    }

    logger.debug('Pipeline completed', {
      gleamId: gleam.id,
      embedding: embeddingOutcome,
      summary: summaryOutcome,
      tags: tagOutcome,
      relation: relationOutcome,
    })
  }

  private async runStage(stage: ObservationStage, ctx: ObservationContext): Promise<StageOutcome> {
    try {
      return await stage.execute(ctx)
    } catch (e) {
      // Stages catch their own errors and return 'failed'. If we reach
      // here, something unexpected happened — log and treat as failure.
      logger.error('Stage threw unexpectedly', {
        stage: stage.artifact,
        gleamId: ctx.gleam.id,
        error: e instanceof Error ? e.message : String(e),
      })
      return 'failed'
    }
  }
}
