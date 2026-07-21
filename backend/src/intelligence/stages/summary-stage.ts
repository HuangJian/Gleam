import type { IIntelligenceRepository } from '../../repository/repository'
import type { LLMInput } from '../../gateway/llm-provider'
import { LLMError } from '../../gateway/llm-provider'
import type { ObservationContext } from '../observation-context'
import type { ObservationStage, StageOutcome } from './stage'
import { withLLMRetry } from './stage'

/**
 * Summary Stage — produces a one-sentence summary of a Gleam.
 *
 * Reads the Gleam's thought + source, renders the Summary prompt, and
 * calls the provider's chat endpoint. The summary is stored in
 * `gleam_ai.summary` together with the prompt version for provenance.
 *
 * Dependencies: none. Summary is independent of Embedding and Tag.
 */
export class SummaryStage implements ObservationStage {
  readonly artifact = 'summary' as const

  constructor(private readonly repo: IIntelligenceRepository) {}

  async execute(ctx: ObservationContext): Promise<StageOutcome> {
    if (ctx.gleamAI?.summaryStatus === 'completed') return 'success'

    await this.repo.setArtifactStatus(ctx.gleam.id, 'summary', 'running')

    try {
      const prompt = ctx.promptRegistry.resolve('summary')
      const input: LLMInput = {
        thought: ctx.gleam.thought,
        source: ctx.gleam.source,
      }
      const result = await withLLMRetry(() => ctx.provider.summarize(input, prompt.content))
      await this.repo.updateSummary(
        ctx.gleam.id,
        result.summary,
        ctx.provider.endpoint,
        ctx.provider.model,
        prompt.version,
      )
      return 'success'
    } catch (e) {
      const permanent = e instanceof LLMError && !e.retryable
      await this.repo.recordArtifactFailure(ctx.gleam.id, 'summary', permanent)
      return 'failed'
    }
  }
}
