/**
 * LLM Gateway — provider abstraction.
 *
 * The Intelligence subsystem never imports provider SDKs or provider-
 * specific request formats. It depends only on this `LLMProvider`
 * interface. Provider-specific implementations live in the `gateway/`
 * module and remain isolated behind this contract.
 *
 * Replacing one provider with another must not require modifications to
 * Intelligence (pipeline, scheduler) logic.
 *
 * Dependency direction:
 *
 *   Intelligence → LLMGateway → LLMProvider (interface)
 *                                    │
 *                         ┌──────────┴──────────┐
 *                         ▼                     ▼
 *                   OpenAICompatibleProvider  FutureProvider
 */

import type { Source } from '../domain/gleam'

/**
 * Input passed to every semantic capability — the parts of a Gleam
 * that may be transmitted to the external provider.
 *
 * This is explicitly a subset of the Gleam: only the user's thought
 * and source context. No metadata (id, timestamps, derived fields)
 * is sent to providers.
 */
export interface LLMInput {
  thought: string
  source: Source
}

// ── Result types ───────────────────────────────────────

/**
 * Result of `validateConfig()`. Carries provider-specific metadata
 * discovered during validation that should be persisted alongside
 * the provider configuration.
 */
export interface ValidationResult {
  /**
   * Whether the API accepts `reasoning: { enabled: false }` to suppress
   * chain-of-thought output. When true, chat requests send the param so
   * `content` holds only the answer (not the CoT trace).
   *
   * Probed once during validation and persisted — never re-probed at
   * runtime to avoid unnecessary API calls and rate-limit triggers.
   */
  reasoningSuppression: boolean
}

export interface SummarizeResult {
  summary: string
}

export interface TagsResult {
  tags: string[]
}

export interface EmbeddingResult {
  /** Raw Float32 bytes — caller wraps in Float32Array for storage. */
  embedding: Buffer
  dimensions: number
}

/**
 * Thrown when a provider call fails.
 *
 * `retryable` distinguishes transient failures (network, rate-limit)
 * from permanent ones (invalid API key, unsupported model). The
 * Scheduler uses this to decide whether to schedule a retry.
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'LLMError'
  }
}

// ── Provider interface ─────────────────────────────────

export interface LLMProvider {
  /** Provider name (e.g. 'openai'). */
  readonly name: string

  /**
   * API endpoint used for requests. Stored in `gleam_ai.provider` for
   * provenance — identifies the actual provider instance, unlike `name`
   * which is a generic category (e.g. 'openai-compatible').
   */
  readonly endpoint: string

  /** Model used for chat-based capabilities (summary, tags). */
  readonly model: string

  /** Model used for embedding generation. May differ from `model`. */
  readonly embeddingModel: string

  /**
   * Validate that the configured API key + model are usable.
   *
   * Called by `configureProvider` before persistence — invalid
   * credentials are rejected immediately. Throws `LLMError` on
   * failure (non-retryable for auth issues).
   *
   * Returns a `ValidationResult` with provider-specific metadata
   * (e.g. reasoning suppression support) that should be persisted
   * alongside the configuration.
   */
  validateConfig(): Promise<ValidationResult>

  summarize(input: LLMInput, prompt: string): Promise<SummarizeResult>
  generateTags(input: LLMInput, prompt: string): Promise<TagsResult>
  generateEmbedding(input: LLMInput): Promise<EmbeddingResult>
}
