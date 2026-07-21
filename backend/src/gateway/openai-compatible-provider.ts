import type {
  EmbeddingResult,
  LLMInput,
  LLMProvider,
  SummarizeResult,
  TagsResult,
} from './llm-provider'
import { LLMError } from './llm-provider'

/**
 * OpenAI-compatible provider implementation.
 *
 * Works with any API that conforms to the OpenAI Chat Completions and
 * Embeddings formats (e.g. OpenAI, NVIDIA, Azure OpenAI, local LLMs).
 *
 * The user-supplied `endpoint` is used as the base URL; chat and embedding
 * URLs are auto-completed as `{endpoint}/v1/chat/completions` and
 * `{endpoint}/v1/embeddings`.
 *
 * NOTE: Future expansion may support different providers/endpoints for
 * chat and embedding (e.g., chat from one service, embeddings from another).
 * For now, both capabilities share the same endpoint and API key.
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
   * Disable chain-of-thought for reasoning models (e.g. NVIDIA
   * nemotron-3-ultra). When true, chat requests send
   * `reasoning: { enabled: false }` so `content` holds only the answer.
   * Standard OpenAI models reject the param, so it is opt-in.
   */
  reasoningEnabled?: boolean
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible'
  readonly model: string
  readonly embeddingModel: string

  private readonly apiKey: string
  private readonly chatUrl: string
  private readonly embeddingsUrl: string
  private readonly reasoningEnabled: boolean

  constructor(opts: OpenAICompatibleProviderOptions) {
    this.apiKey = opts.apiKey
    this.model = opts.model
    this.embeddingModel = opts.embeddingModel
    this.reasoningEnabled = opts.reasoningEnabled ?? false
    const base = opts.endpoint.replace(/\/+$/, '')
    if (!base) {
      throw new Error('OpenAI-compatible provider requires a non-empty endpoint')
    }
    this.chatUrl = `${base}/v1/chat/completions`
    this.embeddingsUrl = `${base}/v1/embeddings`
  }

  async validateConfig(): Promise<void> {
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

  private async chatCompletion(
    systemPrompt: string,
    userContent: string,
    opts: { temperature: number; maxTokens: number },
  ): Promise<{
    choices?: Array<{ message?: { content?: string } }>
  }> {
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
      // into `content` by default; disabling keeps `content` clean. Standard
      // OpenAI models reject the param, so it is only sent when opted in.
      if (this.reasoningEnabled) {
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

    return (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
  }

  private async toLLMError(res: Response, prefix: string): Promise<LLMError> {
    let body = ''
    try {
      body = await res.text()
    } catch {
      // ignore
    }
    const retryable = res.status === 429 || res.status >= 500
    // 401 is auth — permanent. 404 is model not found — permanent.
    // 429 is rate limit — retryable. 5xx is server — retryable.
    const snippet = body.length > 200 ? body.slice(0, 200) + '…' : body
    return new LLMError(
      `${prefix}: ${res.status} ${res.statusText} ${snippet}`,
      retryable,
      res.status,
    )
  }
}

// ── Helpers ────────────────────────────────────────────

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
 *
 * NOTE: case is NOT normalized. Reasoning models (e.g. NVIDIA
 * nemotron-3-ultra) occasionally emit camelCase tags (e.g. `useReducer`)
 * that violate the lowercase kebab-case contract the Tags prompt requests.
 * This is a known model-adherence gap — callers that require strict
 * kebab-case must normalize downstream (see validate-tags.ts, which
 * reports such tags as a WARN rather than failing).
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
