import type { IIntelligenceRepository } from '../../repository/repository'
import type { ObservationContext } from '../observation-context'
import type { ObservationStage, StageOutcome } from './stage'
import { logger } from '../../util/logger'

/**
 * Relation Stage — produces semantic_proximity relations between Gleams.
 *
 * Unlike the other stages, Relation does not call the LLM directly.
 * Instead, it:
 *
 *   1. Reads the current Gleam's embedding (must be completed).
 *   2. Computes cosine similarity against every other Gleam embedding
 *      in the Repository (application-level — no vector database).
 *   3. Stores pairs whose similarity exceeds `threshold` into
 *      `gleam_relations`, capped at `limit` per Gleam.
 *
 * When the stage re-runs for a Gleam, it replaces only AI-origin
 * relations. User-created relations are never automatically modified
 * or deleted.
 *
 * Dependencies: Embedding (must be completed). If Embedding is not
 * available, the stage is skipped.
 */
export class RelationStage implements ObservationStage {
  readonly artifact = 'relation' as const

  constructor(
    private readonly repo: IIntelligenceRepository,
    private readonly threshold: number,
    private readonly limit: number,
  ) {}

  async execute(ctx: ObservationContext): Promise<StageOutcome> {
    if (ctx.gleamAI?.relationStatus === 'completed') return 'success'

    // Dependency: Embedding must be completed.
    if (ctx.gleamAI?.embeddingStatus !== 'completed' || !ctx.gleamAI.embedding) {
      return 'skipped'
    }

    await this.repo.setArtifactStatus(ctx.gleam.id, 'relation', 'running')

    try {
      const similar = await this.repo.findSimilarGleams(ctx.gleam.id, this.threshold, this.limit)

      await this.repo.replaceAIRelations(
        ctx.gleam.id,
        similar.map((s) => ({ targetGleamId: s.gleamId, strength: s.similarity })),
      )

      // Record the relation prompt version (provenance). The relation
      // strategy is defined by prompts/relation/v1.md.
      const prompt = ctx.promptRegistry.resolve('relation')
      await this.repo.updateRelationObservation(
        ctx.gleam.id,
        ctx.provider.name,
        ctx.provider.model,
        prompt.version,
      )

      if (similar.length > 0) {
        logger.debug('Relation stage produced relations', {
          gleamId: ctx.gleam.id,
          count: similar.length,
          topScore: similar[0].similarity.toFixed(3),
        })
      }
      return 'success'
    } catch {
      await this.repo.recordArtifactFailure(ctx.gleam.id, 'relation')
      return 'failed'
    }
  }
}
