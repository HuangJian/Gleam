import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { OpenAICompatibleProvider, isReasoningModel } from '../gateway/openai-compatible-provider'
import type { LLMInput } from '../gateway/llm-provider'

// ── Test fixtures ───────────────────────────────────────

const INPUT: LLMInput = {
  thought: 'Immutability makes reasoning about state trivial.',
  source: {
    type: 'url',
    url: 'https://example.com/fp',
    title: 'Why FP Matters',
    excerpt: 'Pure functions and immutable data eliminate bugs.',
  },
}

const PROMPT = 'You are an observer. Summarize in one sentence.'

function makeProvider(model: string, reasoningSuppression = false): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    apiKey: 'test-key',
    model,
    embeddingModel: 'test-embedding',
    endpoint: 'https://api.example.com',
    reasoningSuppression,
  })
}

/**
 * Captures the request body sent to fetch so tests can assert on the
 * `reasoning` field without making real HTTP calls.
 *
 * `validateConfigProbe` controls how the probe request (the one with
 * `reasoning` param and "Say OK." prompt) is handled during validateConfig().
 */
function mockFetchForValidate(
  content: string,
  probeBehavior: 'accept' | 'reject' | 'error' = 'accept',
): {
  realRequestBody: () => Record<string, unknown> | undefined
  probeWasSent: () => boolean
} {
  let realBody: Record<string, unknown> | undefined
  let probeSent = false

  globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {}

    const messages = body.messages as Array<{ content: string }> | undefined
    const isProbe = messages?.length === 1 && messages[0]?.content === 'Say OK.'
    const hasReasoningParam = body.reasoning !== undefined

    if (isProbe && hasReasoningParam) {
      probeSent = true
      if (probeBehavior === 'reject') {
        return new Response(JSON.stringify({ error: 'Unsupported parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (probeBehavior === 'error') {
        throw new Error('Network error')
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Real request
    realBody = body
    return new Response(
      JSON.stringify({
        choices: [{ message: { content } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }) as unknown as typeof fetch

  return {
    realRequestBody: () => realBody,
    probeWasSent: () => probeSent,
  }
}

// ── Tests: isReasoningModel (pattern fallback) ──────────

describe('isReasoningModel', () => {
  test('detects NVIDIA Nemotron models', () => {
    expect(isReasoningModel('nvidia/nemotron-3-ultra-550b-a55b')).toBe(true)
    expect(isReasoningModel('nemotron-4-super')).toBe(true)
  })

  test('detects DeepSeek reasoning models', () => {
    expect(isReasoningModel('deepseek-r1')).toBe(true)
    expect(isReasoningModel('deepseek-reasoner')).toBe(true)
    expect(isReasoningModel('deepseek-r1-distill-qwen-7b')).toBe(true)
  })

  test('detects Qwen QwQ', () => {
    expect(isReasoningModel('qwq-32b')).toBe(true)
    expect(isReasoningModel('qwen/qwq-32b-preview')).toBe(true)
  })

  test('does NOT flag standard models', () => {
    expect(isReasoningModel('gpt-4o-mini')).toBe(false)
    expect(isReasoningModel('gpt-4o')).toBe(false)
    expect(isReasoningModel('claude-3-5-sonnet')).toBe(false)
    expect(isReasoningModel('deepseek-chat')).toBe(false)
  })
})

// ── Tests: constructor uses persisted flag ──────────────

describe('OpenAICompatibleProvider chatCompletion', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('sends reasoning param when reasoningSuppression=true', async () => {
    let captured: Record<string, unknown> | undefined
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      captured = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : undefined
      return new Response(JSON.stringify({ choices: [{ message: { content: 'A summary.' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const provider = makeProvider('nvidia/nemotron-3-ultra-550b-a55b', true)
    await provider.summarize(INPUT, PROMPT)

    expect(captured).toBeDefined()
    expect(captured!.reasoning).toEqual({ enabled: false })
  })

  test('does NOT send reasoning param when reasoningSuppression=false', async () => {
    let captured: Record<string, unknown> | undefined
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      captured = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : undefined
      return new Response(JSON.stringify({ choices: [{ message: { content: 'A summary.' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const provider = makeProvider('gpt-4o-mini', false)
    await provider.summarize(INPUT, PROMPT)

    expect(captured).toBeDefined()
    expect(captured!.reasoning).toBeUndefined()
  })

  test('no probe request at runtime — only the real chat call', async () => {
    let requestCount = 0
    globalThis.fetch = mock(async () => {
      requestCount++
      return new Response(JSON.stringify({ choices: [{ message: { content: 'A summary.' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const provider = makeProvider('nvidia/nemotron-3-ultra-550b-a55b', true)
    await provider.summarize(INPUT, PROMPT)
    await provider.generateTags(INPUT, PROMPT)

    // Exactly 2 requests (one per call), no probe
    expect(requestCount).toBe(2)
  })

  test('uses message.content, not reasoning_content, as summary', async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'The actual summary.',
                reasoning_content: 'Let me think about this…',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    const provider = makeProvider('nvidia/nemotron-3-ultra-550b-a55b', true)
    const result = await provider.summarize(INPUT, PROMPT)

    expect(result.summary).toBe('The actual summary.')
    expect(result.summary).not.toContain('Let me think')
  })
})

// ── Tests: validateConfig probes and returns result ─────

describe('OpenAICompatibleProvider.validateConfig', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('probes and returns reasoningSuppression=true when API accepts', async () => {
    const { probeWasSent } = mockFetchForValidate('OK', 'accept')
    const provider = makeProvider('nvidia/nemotron-3-ultra-550b-a55b')

    const result = await provider.validateConfig()

    expect(probeWasSent()).toBe(true)
    expect(result.reasoningSuppression).toBe(true)
  })

  test('probes and returns reasoningSuppression=false when API rejects', async () => {
    const { probeWasSent } = mockFetchForValidate('OK', 'reject')
    const provider = makeProvider('gpt-4o-mini')

    const result = await provider.validateConfig()

    expect(probeWasSent()).toBe(true)
    expect(result.reasoningSuppression).toBe(false)
  })

  test('falls back to pattern matching on probe network error (reasoning model)', async () => {
    const { probeWasSent } = mockFetchForValidate('OK', 'error')
    const provider = makeProvider('nvidia/nemotron-3-ultra-550b-a55b')

    const result = await provider.validateConfig()

    expect(probeWasSent()).toBe(true)
    // nemotron matches the pattern → true
    expect(result.reasoningSuppression).toBe(true)
  })

  test('falls back to false on probe network error (non-reasoning model)', async () => {
    const { probeWasSent } = mockFetchForValidate('OK', 'error')
    const provider = makeProvider('gpt-4o-mini')

    const result = await provider.validateConfig()

    expect(probeWasSent()).toBe(true)
    expect(result.reasoningSuppression).toBe(false)
  })

  test('detects unknown reasoning model via probe (not pattern)', async () => {
    // A model not in REASONING_MODEL_PATTERNS, but the API accepts the param
    const { probeWasSent } = mockFetchForValidate('OK', 'accept')
    const provider = makeProvider('some-vendor/new-reasoner-v2')

    const result = await provider.validateConfig()

    expect(probeWasSent()).toBe(true)
    expect(result.reasoningSuppression).toBe(true)
  })
})
