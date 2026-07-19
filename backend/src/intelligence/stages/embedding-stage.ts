import type { IIntelligenceRepository } from '../../repository/repository'
import type { LLMInput } from '../../gateway/llm-provider'
import type { ObservationContext } from '../observation-context'
import type { ObservationStage, StageOutcome } from './stage'

/**
 * Embedding Stage — produces a vector representation of a Gleam.
 *
 * Reads the Gleam's thought + source, calls the provider's embedding
 * endpoint, and stores the result as a Float32 BLOB.
 *
 * Embeddings are stored persistently even though semantic retrieval is
 * not yet implemented — Embedding computation is typically the most
 * expensive AI operation, and persisting vectors avoids unnecessary
 * recomputation after restarts.
 *
 * Dependencies: none. Embedding is independent of Summary and Tag.
 */
export class EmbeddingStage implements ObservationStage {
  readonly artifact = 'embedding' as const

  constructor(private readonly repo: IIntelligenceRepository) {}

  async execute(ctx: ObservationContext): Promise<StageOutcome> {
    // Idempotent: skip if already completed.
    if (ctx.gleamAI?.embeddingStatus === 'completed') return 'success'

    await this.repo.setArtifactStatus(ctx.gleam.id, 'embedding', 'running')

    try {
      const input: LLMInput = {
        thought: ctx.gleam.thought,
        source: ctx.gleam.source,
      }
      const result = await ctx.provider.generateEmbedding(input)
      await this.repo.updateEmbedding(
        ctx.gleam.id,
        result.embedding,
        result.dimensions,
        ctx.provider.name,
        ctx.provider.embeddingModel,
      )
      return 'success'
    } catch {
      await this.repo.recordArtifactFailure(ctx.gleam.id, 'embedding')
      return 'failed'
    }
  }
}
