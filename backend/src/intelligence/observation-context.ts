import type { Gleam } from '../domain/gleam'
import type { GleamAI } from '../domain/gleam-ai'
import type { LLMProvider } from '../gateway/llm-provider'
import type { PromptRegistry } from './prompt-registry'

/**
 * Observation Context — transient processing state for one observation
 * cycle on one Gleam.
 *
 * Rather than repeatedly loading Repository state, every observation
 * shares this single context. Stages enrich it as semantic computation
 * progresses. The context is never persisted — it exists only during
 * one Pipeline run.
 *
 *   ObservationContext
 *     ├── gleam            (immutable Repository data)
 *     ├── gleamAI          (current semantic observation, may be null)
 *     ├── provider         (LLM gateway)
 *     └── promptRegistry   (resolves latest prompts)
 */
export interface ObservationContext {
  gleam: Gleam
  gleamAI: GleamAI | null
  provider: LLMProvider
  promptRegistry: PromptRegistry
}
