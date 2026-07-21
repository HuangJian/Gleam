import type { IIntelligenceRepository } from '../../repository/repository'
import type { LLMInput } from '../../gateway/llm-provider'
import { LLMError } from '../../gateway/llm-provider'
import type { ObservationContext } from '../observation-context'
import type { ObservationStage, StageOutcome } from './stage'
import { withLLMRetry } from './stage'

/**
 * Tag Stage — produces 3–5 AI-suggested tags for a Gleam.
 *
 * Reads the Gleam's thought + source, renders the Tags prompt, and
 * calls the provider's chat endpoint. AI tags are stored in
 * `gleam_ai.tags` — they never directly modify `gleam_derived.tags`.
 *
 * The visible tag set is computed at read time:
 *   unique(userTags + aiTags) − removedTags
 *
 * Dependencies: none. Tag is independent of Embedding and Summary.
 */
export class TagStage implements ObservationStage {
  readonly artifact = 'tags' as const

  constructor(private readonly repo: IIntelligenceRepository) {}

  async execute(ctx: ObservationContext): Promise<StageOutcome> {
    if (ctx.gleamAI?.tagStatus === 'completed') return 'success'

    await this.repo.setArtifactStatus(ctx.gleam.id, 'tags', 'running')

    try {
      const prompt = ctx.promptRegistry.resolve('tags')
      const input: LLMInput = {
        thought: ctx.gleam.thought,
        source: ctx.gleam.source,
      }
      const result = await withLLMRetry(() => ctx.provider.generateTags(input, prompt.content))
      await this.repo.updateTags(
        ctx.gleam.id,
        result.tags,
        ctx.provider.endpoint,
        ctx.provider.model,
        prompt.version,
      )
      return 'success'
    } catch (e) {
      const permanent = e instanceof LLMError && !e.retryable
      await this.repo.recordArtifactFailure(ctx.gleam.id, 'tags', permanent)
      return 'failed'
    }
  }
}
