import type {
  EmbeddingResult,
  LLMInput,
  LLMProvider,
  SummarizeResult,
  TagsResult,
} from './llm-provider'
import { LLMError } from './llm-provider'

/**
 * OpenAI reference provider implementation.
 *
 * Uses the OpenAI Chat Completions API for summary/tag generation and
 * the Embeddings API for embedding generation. All HTTP calls use the
 * built-in `fetch` (no SDK dependency).
 *
 * Provider-specific response formats, retry policies and rate limits
 * never propagate into business logic — they remain entirely inside
 * this adapter.
 *
 * The `apiKey` is held in memory only at the point of invocation and
 * is never logged.
 */

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'

interface OpenAIProviderOptions {
  apiKey: string
  /** Chat model for summary/tag generation (e.g. 'gpt-4o-mini'). */
  model: string
  /**
   * Embedding model (e.g. 'text-embedding-3-small'). Separate from
   * the chat model because different providers may produce vectors
   * with different dimensions.
   */
  embeddingModel: string
  /** Base URL override (for testing or OpenAI-compatible providers). */
  baseUrl?: string
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'
  readonly model: string
  readonly embeddingModel: string

  private readonly apiKey: string
  private readonly chatUrl: string
  private readonly embeddingsUrl: string

  constructor(opts: OpenAIProviderOptions) {
    this.apiKey = opts.apiKey
    this.model = opts.model
    this.embeddingModel = opts.embeddingModel
    const base = (opts.baseUrl ?? '').replace(/\/$/, '')
    this.chatUrl = base ? `${base}/v1/chat/completions` : OPENAI_CHAT_URL
    this.embeddingsUrl = base ? `${base}/v1/embeddings` : OPENAI_EMBEDDINGS_URL
  }

  async validateConfig(): Promise<void> {
    // Light validation: issue a minimal embeddings request. If the key
    // or model is invalid, OpenAI returns 401/404 immediately.
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
        throw new LLMError('Invalid OpenAI API key', false, 401)
      }
      if (res.status === 404) {
        throw new LLMError(`Unknown OpenAI model: ${this.embeddingModel}`, false, 404)
      }
      if (!res.ok && res.status !== 400) {
        // 400 can happen if 'validation' is rejected for length but auth was fine.
        throw new LLMError(
          `OpenAI validation failed: ${res.status} ${res.statusText}`,
          res.status >= 500,
          res.status,
        )
      }
    } catch (e) {
      if (e instanceof LLMError) throw e
      // Network errors are retryable.
      throw new LLMError(
        `OpenAI validation network error: ${e instanceof Error ? e.message : String(e)}`,
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
      throw new LLMError('OpenAI returned empty summary', true)
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
      throw new LLMError('OpenAI returned no parseable tags', true)
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
        `OpenAI embeddings network error: ${e instanceof Error ? e.message : String(e)}`,
        true,
      )
    }

    if (!res.ok) {
      throw await this.toLLMError(res, 'OpenAI embeddings request failed')
    }

    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>
    }
    const vec = data.data?.[0]?.embedding
    if (!vec || vec.length === 0) {
      throw new LLMError('OpenAI returned empty embedding', true)
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
      res = await fetch(this.chatUrl, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
      })
    } catch (e) {
      throw new LLMError(
        `OpenAI chat network error: ${e instanceof Error ? e.message : String(e)}`,
        true,
      )
    }

    if (!res.ok) {
      throw await this.toLLMError(res, 'OpenAI chat request failed')
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

function buildEmbeddingText(input: LLMInput): string {
  const parts: string[] = [input.thought]
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
