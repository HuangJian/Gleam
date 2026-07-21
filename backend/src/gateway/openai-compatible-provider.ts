import type {
  EmbeddingResult,
  LLMInput,
  LLMProvider,
  SummarizeResult,
  TagsResult,
  ValidationResult,
} from './llm-provider'
import { LLMError } from './llm-provider'
import { logger } from '../util/logger'

/**
 * OpenAI-compatible provider implementation.
 *
 * Works with any API that conforms to the OpenAI Chat Completions and
 * Embeddings formats (e.g. OpenAI, NVIDIA, Azure OpenAI, local LLMs).
 *
 * The user-supplied `endpoint` is used as the base URL; chat and embedding
 * URLs are auto-completed as `{endpoint}/v1/chat/completions` and
 * `{endpoint}/v1/embeddings`.
 */

interface OpenAICompatibleProviderOptions {
  apiKey: string
  /** Chat model for summary/tag generation (e.g. 'gpt-4o-mini'). */
  model: string
  /**
   * Embedding model (e.g. 'text-embedding-3-small'). Separate from
   * the chat model because different providers may produce vectors
   * with different dimensions.
   */
  embeddingModel: string
  /** Base API endpoint (e.g. 'https://api.openai.com' or 'https://integrate.api.nvidia.com'). */
  endpoint: string
  /**
   * Whether the API accepts `reasoning: { enabled: false }` to suppress
   * chain-of-thought output. Probed once during `validateConfig()` and
   * persisted in the database — passed back here when constructing the
   * provider at runtime so no re-probing is needed.
   */
  reasoningSuppression: boolean
}

/** Response shape from an OpenAI-compatible chat completion endpoint. */
interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
      /** Reasoning chain-of-thought, returned separately by some APIs. */
      reasoning_content?: string
    }
  }>
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible'
  readonly endpoint: string
  readonly model: string
  readonly embeddingModel: string

  private readonly apiKey: string
  private readonly chatUrl: string
  private readonly embeddingsUrl: string
  private readonly reasoningSuppression: boolean

  constructor(opts: OpenAICompatibleProviderOptions) {
    this.apiKey = opts.apiKey
    this.model = opts.model
    this.embeddingModel = opts.embeddingModel
    this.reasoningSuppression = opts.reasoningSuppression
    const base = opts.endpoint.replace(/\/+$/, '')
    if (!base) {
      throw new Error('OpenAI-compatible provider requires a non-empty endpoint')
    }
    this.endpoint = base
    this.chatUrl = `${base}/v1/chat/completions`
    this.embeddingsUrl = `${base}/v1/embeddings`
  }

  async validateConfig(): Promise<ValidationResult> {
    try {
      const res = await fetch(this.embeddingsUrl, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.embeddingModel,
          input: 'validation',
        }),
      })
      if (res.status === 401) {
        throw new LLMError('Invalid API key or endpoint', false, 401)
      }
      if (res.status === 404) {
        throw new LLMError(`Unknown model: ${this.embeddingModel}`, false, 404)
      }
      if (!res.ok && res.status !== 400) {
        // 400 can happen if 'validation' is rejected for length but auth was fine.
        throw new LLMError(
          `Validation failed: ${res.status} ${res.statusText}`,
          res.status >= 500,
          res.status,
        )
      }
    } catch (e) {
      if (e instanceof LLMError) throw e
      // Network errors are retryable.
      throw new LLMError(
        `Validation network error: ${e instanceof Error ? e.message : String(e)}`,
        true,
      )
    }

    // Probe the chat endpoint for reasoning suppression support.
    // This runs once at configuration time; the result is persisted and
    // reused for all future provider instances.
    const reasoningSuppression = await this.probeReasoningSuppression()
    return { reasoningSuppression }
  }

  async summarize(input: LLMInput, prompt: string): Promise<SummarizeResult> {
    const userContent = buildUserContent(input)
    const data = await this.chatCompletion(prompt, userContent, {
      temperature: 0.3,
      maxTokens: 200,
    })
    const summary = data.choices?.[0]?.message?.content?.trim()
    if (!summary) {
      throw new LLMError('Provider returned empty summary', true)
    }
    return { summary }
  }

  async generateTags(input: LLMInput, prompt: string): Promise<TagsResult> {
    const userContent = buildUserContent(input)
    const data = await this.chatCompletion(prompt, userContent, {
      temperature: 0.2,
      maxTokens: 150,
    })
    const raw = data.choices?.[0]?.message?.content?.trim() ?? ''
    const tags = parseTagsResponse(raw)
    if (tags.length === 0) {
      throw new LLMError('Provider returned no parseable tags', true)
    }
    return { tags }
  }

  async generateEmbedding(input: LLMInput): Promise<EmbeddingResult> {
    const text = buildEmbeddingText(input)
    let res: Response
    try {
      res = await fetch(this.embeddingsUrl, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.embeddingModel,
          input: text,
          // input_type=passage is required for instruction-tuned embedding
          // models (e.g. NVIDIA Nemotron-3-Embed-1B). Without it, the model
          // skips the instruction prefix and all embeddings collapse into a
          // narrow cone — cosine similarity exceeds 0.8 even for unrelated
          // content. Providers that don't recognise this field (e.g. OpenAI)
          // silently ignore it. encoding_format=float is explicit but also
          // the API default for most providers.
          input_type: 'passage',
          encoding_format: 'float',
        }),
      })
    } catch (e) {
      throw new LLMError(
        `Embeddings network error: ${e instanceof Error ? e.message : String(e)}`,
        true,
      )
    }

    if (!res.ok) {
      throw await this.toLLMError(res, 'Embeddings request failed')
    }

    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>
    }
    const vec = data.data?.[0]?.embedding
    if (!vec || vec.length === 0) {
      throw new LLMError('Provider returned empty embedding', true)
    }

    const float32 = new Float32Array(vec)
    return {
      embedding: Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength),
      dimensions: vec.length,
    }
  }

  // ── Internals ──────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    }
  }

  /**
   * Probes the chat endpoint to determine whether the API accepts the
   * `reasoning: { enabled: false }` parameter.
   *
   * Sends a minimal chat request ("Say OK.", max_tokens 5) with the param.
   * If the API returns 200, the param is supported. If it returns 400/422
   * (param rejected) or a network error occurs, falls back to
   * `isReasoningModel()` pattern matching on the model name — known
   * reasoning models are always detected even if the probe fails.
   *
   * Called once during `validateConfig()`. The result is persisted in the
   * database and passed to future provider constructors — this method is
   * never called at runtime.
   */
  private async probeReasoningSuppression(): Promise<boolean> {
    try {
      const res = await fetch(this.chatUrl, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model,
          max_tokens: 5,
          reasoning: { enabled: false },
          messages: [{ role: 'user', content: 'Say OK.' }],
        }),
      })

      if (res.ok) {
        const data = (await res.json().catch(() => null)) as ChatCompletionResponse | null
        const hasReasoningContent = !!data?.choices?.[0]?.message?.reasoning_content

        logger.info('Reasoning probe: suppression param accepted', {
          model: this.model,
          reasoningContent: hasReasoningContent,
        })
        return true
      }

      // API rejected the param — fall back to pattern matching so known
      // reasoning models are still detected even when the probe fails.
      const fallback = isReasoningModel(this.model)
      logger.info('Reasoning probe: suppression param rejected, using pattern fallback', {
        model: this.model,
        status: res.status,
        suppressed: fallback,
      })
      return fallback
    } catch {
      // Network error — fall back to pattern matching on the model name.
      const fallback = isReasoningModel(this.model)
      logger.debug('Reasoning probe: network error, using pattern fallback', {
        model: this.model,
        suppressed: fallback,
      })
      return fallback
    }
  }

  private async chatCompletion(
    systemPrompt: string,
    userContent: string,
    opts: { temperature: number; maxTokens: number },
  ): Promise<ChatCompletionResponse> {
    let res: Response
    try {
      const body: Record<string, unknown> = {
        model: this.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }
      // Reasoning models (e.g. NVIDIA nemotron-3-ultra) emit chain-of-thought
      // into `content` by default; disabling keeps `content` clean. The flag
      // was probed once during validateConfig() and persisted — no runtime
      // probing needed.
      if (this.reasoningSuppression) {
        body.reasoning = { enabled: false }
      }
      res = await fetch(this.chatUrl, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      })
    } catch (e) {
      throw new LLMError(`Chat network error: ${e instanceof Error ? e.message : String(e)}`, true)
    }

    if (!res.ok) {
      throw await this.toLLMError(res, 'Chat request failed')
    }

    return (await res.json()) as ChatCompletionResponse
  }

  private async toLLMError(res: Response, prefix: string): Promise<LLMError> {
    let body = ''
    try {
      body = await res.text()
    } catch {
      // ignore
    }
    const retryable = res.status === 429 || res.status >= 500
    const snippet = body.length > 200 ? body.slice(0, 200) + '…' : body
    return new LLMError(
      `${prefix}: ${res.status} ${res.statusText} ${snippet}`,
      retryable,
      res.status,
    )
  }
}

// ── Helpers ────────────────────────────────────────────

/**
 * Known reasoning model name patterns.
 *
 * Used as a fallback when the runtime probe fails (e.g. network error
 * during validation). The primary detection mechanism is
 * `probeReasoningSuppression()`, which tests the actual API behavior.
 */
const REASONING_MODEL_PATTERNS: readonly RegExp[] = [
  /nemotron/i, // NVIDIA Nemotron series
  /deepseek-r(\d)/i, // DeepSeek R1, R2, …
  /deepseek-reasoner/i, // DeepSeek Reasoner
  /qwq/i, // Qwen QwQ
]

/**
 * Returns true if the model name matches a known reasoning model pattern.
 *
 * This is a **fallback** used only when the validation-time probe fails.
 * The primary detection is `OpenAICompatibleProvider.probeReasoningSuppression()`,
 * which sends a minimal request to test whether the API actually accepts
 * the `reasoning: { enabled: false }` parameter.
 */
export function isReasoningModel(model: string): boolean {
  return REASONING_MODEL_PATTERNS.some((re) => re.test(model))
}

function buildUserContent(input: LLMInput): string {
  const parts: string[] = []
  parts.push(`Thought: ${input.thought}`)
  if (input.source.title) parts.push(`Source title: ${input.source.title}`)
  if (input.source.url) parts.push(`Source URL: ${input.source.url}`)
  if (input.source.excerpt) parts.push(`Source excerpt: ${input.source.excerpt}`)
  return parts.join('\n')
}

// The user's `thought` is the core understanding (MANIFEST ch.3) and the
// primary signal for semantic retrieval, so it is repeated to give it more
// weight in the embedding than the source context fields.
const THOUGHT_EMBEDDING_WEIGHT = 3

function buildEmbeddingText(input: LLMInput): string {
  const parts: string[] = []
  for (let i = 0; i < THOUGHT_EMBEDDING_WEIGHT; i++) parts.push(input.thought)
  if (input.source.title) parts.push(input.source.title)
  if (input.source.excerpt) parts.push(input.source.excerpt)
  return parts.join('\n')
}

/**
 * Parse a tags response into a clean string array.
 *
 * Accepts:
 *   - JSON arrays: ["tag1", "tag2"]
 *   - Comma-separated: tag1, tag2, tag3
 *   - One-per-line: tag1\ntag2
 *
 * Strips leading `#` from each tag and trims whitespace.
 */
function parseTagsResponse(raw: string): string[] {
  // Try JSON first.
  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((t) => String(t).trim().replace(/^#/, '')).filter((t) => t.length > 0)
      }
    } catch {
      // fall through to comma/line parsing
    }
  }

  // Comma-separated or line-separated.
  const tokens = trimmed.split(/[,\n]/).map((t) => t.trim().replace(/^#/, ''))
  return tokens.filter((t) => t.length > 0)
}
