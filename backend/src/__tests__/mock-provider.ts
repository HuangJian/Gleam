import type {
  EmbeddingResult,
  LLMInput,
  LLMProvider,
  SummarizeResult,
  TagsResult,
  ValidationResult,
} from '../gateway/llm-provider'
import { LLMError } from '../gateway/llm-provider'

/**
 * Deterministic mock LLMProvider for unit and integration tests.
 *
 * Provider responses are fully deterministic — the same input always
 * produces the same output. This lets Pipeline and Scheduler tests
 * assert exact values without depending on external APIs.
 *
 * Embedding Strategy:
 *   The mock produces a fixed-dimension (8d) topic-vector embedding.
 *   Each dimension corresponds to a keyword in `TOPICS`. If the input
 *   text contains that keyword, the dimension is 1.0; otherwise 0.0.
 *   Two inputs mentioning the same topics therefore produce identical
 *   vectors (cosine similarity = 1.0), making Relation Stage behavior
 *   predictable and testable.
 *
 *   When no topic matches, a non-zero hash-derived vector is produced
 *   to avoid zero-length embeddings (cosine similarity is undefined
 *   for zero vectors).
 *
 * Failure Injection:
 *   Set `failSummary`, `failTags`, or `failEmbedding` to `true` to
 *   make the corresponding method reject. Used for testing stage
 *   failure isolation and retry behavior.
 */

const TOPICS = [
  'react',
  'typescript',
  'philosophy',
  'algorithm',
  'design',
  'database',
  'ai',
  'testing',
] as const

export class MockProvider implements LLMProvider {
  readonly name = 'mock'
  readonly endpoint = 'https://mock.example.com'
  readonly model = 'mock-chat-model'
  readonly embeddingModel = 'mock-embedding-model'

  // ── Failure injection flags ──────────────────────────
  failSummary = false
  failTags = false
  failEmbedding = false

  // ── LLMError failure injection (for retry testing) ───
  /** When > 0, summarize() throws a retryable LLMError (429) and decrements. */
  summaryRetryableFailures = 0
  /** When true, summarize() throws a non-retryable LLMError (401). */
  summaryPermanentFail = false
  /** Tracks summarize() call count for retry assertions. */
  summarizeCallCount = 0

  async validateConfig(): Promise<ValidationResult> {
    // Always valid — no external dependencies.
    return { reasoningSuppression: false }
  }

  async summarize(input: LLMInput, _prompt: string): Promise<SummarizeResult> {
    this.summarizeCallCount++
    if (this.summaryPermanentFail) {
      throw new LLMError('Mock permanent failure (401)', false, 401)
    }
    if (this.summaryRetryableFailures > 0) {
      this.summaryRetryableFailures--
      throw new LLMError('Mock retryable failure (429)', true, 429)
    }
    if (this.failSummary) {
      throw new Error('Mock summary failure (injected)')
    }
    // Deterministic summary derived from the thought.
    const truncated = input.thought.length > 50 ? input.thought.slice(0, 50) + '…' : input.thought
    return { summary: `Summary: ${truncated}` }
  }

  async generateTags(input: LLMInput, _prompt: string): Promise<TagsResult> {
    if (this.failTags) {
      throw new Error('Mock tags failure (injected)')
    }
    // Tags are the topics found in the thought text.
    const lower = input.thought.toLowerCase()
    const tags = TOPICS.filter((t) => lower.includes(t))
    return { tags: tags.length > 0 ? [...tags] : ['general'] }
  }

  async generateEmbedding(input: LLMInput): Promise<EmbeddingResult> {
    if (this.failEmbedding) {
      throw new Error('Mock embedding failure (injected)')
    }

    const text = [input.thought, input.source.title, input.source.excerpt].join(' ')
    const lower = text.toLowerCase()

    const vec = new Float32Array(TOPICS.length)
    let hasAny = false
    for (let i = 0; i < TOPICS.length; i++) {
      if (lower.includes(TOPICS[i])) {
        vec[i] = 1.0
        hasAny = true
      }
    }

    // If no topic matches, produce a non-zero hash-derived vector so
    // cosine similarity is defined. Different texts produce different
    // vectors, preventing accidental similarity = 1.0.
    if (!hasAny) {
      for (let i = 0; i < vec.length; i++) {
        vec[i] = ((text.charCodeAt(i % text.length) % 5) + 1) / 10
      }
    }

    return {
      embedding: Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength),
      dimensions: vec.length,
    }
  }
}
