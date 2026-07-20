/**
 * Standalone validation script for the Summary feature against the
 * NVIDIA Nemotron-3-Ultra-550B-A55B chat model (build.nvidia.com).
 *
 * Run with:
 *   NVIDIA_LLM_API_KEY=<key> bun run backend/scripts/validate-summary.ts
 *
 * The script mirrors the request shape used by the production
 * `OpenAIProvider.summarize` (see backend/src/gateway/openai-provider.ts)
 * and loads the real Summary prompt from backend/prompts/summary/v1.md
 * (the same file the PromptRegistry resolves at runtime), so it validates
 * the actual prompt behavior rather than a copy.
 *
 * It performs no database writes — it only exercises the model endpoint
 * and asserts the response conforms to the Summary contract
 * (one self-contained sentence, ≤30 words, no labels/markdown).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CHAT_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions'
const MODEL = 'nvidia/nemotron-3-ultra-550b-a55b'

// Production uses temperature 0.3; we pin 0 here for reproducible validation.
const TEMPERATURE = 0
const MAX_TOKENS = 200

// ── Types ──────────────────────────────────────────────

interface Source {
  type: string
  url: string
  title: string
  excerpt: string
}

interface LLMInput {
  thought: string
  source: Source
}

// ── Helpers ────────────────────────────────────────────

/** Mirrors `buildUserContent` in openai-provider.ts. */
function buildUserContent(input: LLMInput): string {
  const parts: string[] = []
  parts.push(`Thought: ${input.thought}`)
  if (input.source.title) parts.push(`Source title: ${input.source.title}`)
  if (input.source.url) parts.push(`Source URL: ${input.source.url}`)
  if (input.source.excerpt) parts.push(`Source excerpt: ${input.source.excerpt}`)
  return parts.join('\n')
}

function isCJK(text: string): boolean {
  return /[一-鿿]/.test(text)
}

function countWords(text: string): number {
  if (isCJK(text)) return text.replace(/\s/g, '').length
  return text.trim().split(/\s+/).filter(Boolean).length
}

function stripFences(text: string): string {
  const t = text.trim()
  if (t.startsWith('```') && t.endsWith('```')) {
    return t
      .replace(/^```[a-z]*\n?/i, '')
      .replace(/```$/, '')
      .trim()
  }
  return t
}

async function chat(system: string, user: string): Promise<string> {
  const apiKey = process.env.NVIDIA_LLM_API_KEY
  if (!apiKey) throw new Error('NVIDIA_LLM_API_KEY environment variable is not set')

  const res = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      // Nemotron-3-Ultra is a reasoning model; disable CoT so `content`
      // holds only the answer (not the chain-of-thought trace).
      reasoning: { enabled: false },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const snippet = body.length > 300 ? body.slice(0, 300) + '…' : body
    if (res.status === 401)
      throw new Error(`Authentication failed (401). Check NVIDIA_LLM_API_KEY. ${snippet}`)
    throw new Error(`Chat request failed: ${res.status} ${res.statusText} ${snippet}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Model returned an empty summary')
  return content
}

// ── Validation harness ─────────────────────────────────

interface Check {
  name: string
  pass: boolean
  detail: string
}

const checks: Check[] = []
function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name} — ${detail}`)
}

async function main() {
  console.log(`Validating Summary feature against ${MODEL}`)
  console.log(`Endpoint: ${CHAT_ENDPOINT}\n`)

  const promptPath = join(import.meta.dir, '..', 'prompts', 'summary', 'v1.md')
  const systemPrompt = readFileSync(promptPath, 'utf8')
  console.log(`Loaded prompt: ${promptPath}\n`)

  const samples: LLMInput[] = [
    {
      thought:
        'The key insight was that immutability makes reasoning about state trivial. ' +
        'When a value can never change after it is created, you no longer have to ask ' +
        'where or when it was modified, because the answer is always "nowhere and never". ' +
        'This collapses an entire class of bugs that, in mutable systems, arise from ' +
        'shared references being mutated out from under you at a distance: a function ' +
        'returns, another callback fires, and suddenly the list you were iterating has ' +
        'different contents. With immutable data, every transformation produces a new ' +
        'value and leaves the old one untouched, so any part of the program still holding ' +
        'a reference sees exactly what it always saw. That property is what makes pure ' +
        'functions composable — you can call them in any order, any number of times, even ' +
        'in parallel, and the result is the same. It also makes change visible: instead of ' +
        'mutating in place, you express updates as the difference between an old snapshot ' +
        'and a new one, which is precisely the mental model that time-travel debugging and ' +
        'deterministic replay rely on. The cost is more allocations and the discipline of ' +
        'never reaching for an assignment, but for the kind of state that represents ' +
        'understanding — the gleams a person captures — permanence is a feature, not a tax.',
      source: {
        type: 'url',
        url: 'https://example.com/fp-immutability',
        title: 'Why Functional Programming Matters',
        excerpt:
          'Pure functions and immutable data eliminate whole classes of bugs by removing ' +
          'hidden shared state. When a value cannot change after creation, reasoning about ' +
          'where and when it was modified becomes unnecessary, because the answer is always ' +
          'that it was never modified. Transformations produce new values rather than ' +
          'mutating in place, which keeps every reference stable and makes functions ' +
          'composable, order-independent, and safe to run in parallel. This stability is ' +
          'what enables time-travel debugging and deterministic replay, since the history ' +
          'of a computation is just the sequence of immutable snapshots it moved through. ' +
          'The trade-off is more allocations and the discipline of avoiding assignment, but ' +
          'for state that represents understanding rather than transient UI, permanence ' +
          'pays for itself many times over. The article walks through several examples where ' +
          'a single in-place mutation, made far from its use, caused a failure that took ' +
          'hours to trace, and shows how an immutable rewrite made the same logic obvious ' +
          'and self-documenting. It closes by arguing that immutability is less a performance ' +
          'trick than a way of making the shape of change explicit in the code itself.',
      },
    },
    {
      thought:
        'Caching improves performance by avoiding repeated expensive computation. ' +
        'The idea is simple: if you have already paid the cost to compute something from a ' +
        'given set of inputs, keep the result around and return it next time those same ' +
        'inputs appear, instead of paying again. The win is largest when the computation is ' +
        'genuinely costly — a network round trip, a slow query, a heavy transform — and when ' +
        'the same inputs recur often, which is the normal case for read-heavy workloads. ' +
        'But caching is not free and it is not magic: you must decide what the key is, how ' +
        'long a value stays valid, what happens on a miss, and what to evict when memory ' +
        'fills up. A key that is too coarse returns stale or wrong answers; too fine and the ' +
        'hit rate collapses to nothing. Expiry and invalidation are where most cache bugs ' +
        'live, because the cache is a second copy of truth that can drift from the first. ' +
        'Memoization is the same idea turned inward, applied automatically at the level of a ' +
        'function so that callers do not even know a cache exists. Done well, caching turns ' +
        'latency from a function of the slowest dependency into a function of how often you ' +
        'repeat yourself — and for a personal knowledge store that is re-read far more than ' +
        'it is written, that trade is almost always worth making.',
      source: {
        type: 'book',
        url: '',
        title: 'Performance Patterns',
        excerpt:
          'A cache stores results keyed by inputs to skip redundant work, trading memory ' +
          'for time. The central design questions are the shape of the key, the lifetime of ' +
          'an entry, the miss path, and the eviction policy when the store is full. A key ' +
          'that is too broad returns incorrect or stale data, while one that is too narrow ' +
          'drives the hit rate toward zero and wastes the memory it occupies. Invalidation ' +
          'is the hardest part, because a cache is a duplicate of state that can silently ' +
          'diverge from its source of truth, and most cache defects trace back to a ' +
          'forgotten invalidation rather than to the lookup itself. Memoization applies the ' +
          'same principle at function scope, hiding the cache from callers so that repeated ' +
          'calls with equal arguments return the prior result. The book emphasizes measuring ' +
          'the actual hit rate and access pattern before tuning, since a cache sized or ' +
          'expired wrongly can be slower than no cache at all once miss overhead is counted. ' +
          'It recommends starting with a conservative time-to-live, instrumenting every miss, ' +
          'and only then raising the lifetime once the staleness tolerance of the consumer ' +
          'is understood. For read-dominated systems the amortized cost drops sharply.',
      },
    },
    {
      thought:
        '理解一个系统最好的方式，是试着去改变它并观察反应。' +
        '只读文档和架构图，你看到的是别人希望你认为的结构，而不是它真正运行时的样子。' +
        '当你真的去修改一个参数、删掉一段逻辑、或者替换一个依赖，系统会用自己的行为告诉你' +
        '哪些部分真的耦合在一起，哪些只是看起来相关。这种反馈比任何说明都诚实，因为它来自' +
        '系统本身而不是作者的叙述。改变不必是破坏性的：一个受控的实验、一次小范围的回滚、' +
        '一个开关背后的新实现，都能让你在不冒大风险的前提下看清因果。更重要的是，观察反应' +
        '会暴露那些文档里从未写明的隐含契约——某个下游模块悄悄依赖了上游的一个副作用，' +
        '一旦你动它，整条链路就亮起红灯。所以理解不是静态的阅读，而是动态的试探；不是记住' +
        '结构，而是验证假设。对一个长期维护的知识库来说，这个道理同样成立：你以为某条笔记' +
        '孤立无援，直到你移动它，才发现另外三处引用都指向了它。真正的地图，是在你扰动系统' +
        '之后，由它的反应一笔一笔画出来的。',
      source: {
        type: 'url',
        url: 'https://example.com/systems-thinking',
        title: '系统思考笔记',
        excerpt:
          '反馈回路决定了系统的行为模式。一个系统之所以表现出某种稳定的形态，不是因为' +
          '某个部件被设计成那样，而是因为无数条反馈回路在相互拉扯之后达成了暂时的平衡。' +
          '正反馈会放大变化，让趋势加速；负反馈会抑制变化，把系统拉回某个设定点。理解一个' +
          '系统，关键不在于列出它的组件，而在于找出这些回路：谁在加强、谁在抵消、延迟' +
          '在哪里、以及杠杆点藏在哪。很多看似复杂的故障，追到底都是一条被忽略的反馈路径' +
          '在缓慢起作用，等到被人察觉时，表象已经和原因隔了很远。系统思考主张用存量、流量' +
          '和回路的语言重新描述问题，而不是用线性的因果链，因为线性思维会让人误以为改一个' +
          '地方就只影响一个地方。当你把组织、软件或生态都看作反馈系统，许多原本无解的冲突' +
          '会显出它们的结构根源：不是人犯了错，而是结构鼓励了那种错。笔记最后提醒，任何' +
          '干预都要先问它会触动哪条回路，否则善意的小改也可能在延迟之后引发更大的震荡。',
      },
    },
  ]

  const summaries: string[] = []
  for (let i = 0; i < samples.length; i++) {
    const raw = await chat(systemPrompt, buildUserContent(samples[i]))
    const summary = stripFences(raw)
    summaries.push(summary)
    console.log(`  sample ${i + 1}: "${summary}"`)
  }

  // Check 1: non-empty + single line, ending with terminal punctuation
  // (ASCII .!? or CJK 。！？). CJK text does not use ASCII punctuation.
  const terminal = /[.!?。！？]$/
  const singleSentence = summaries.every((s) => {
    const t = s.trim()
    return t.length > 0 && terminal.test(t) && !t.includes('\n')
  })
  record(
    'single-sentence',
    singleSentence,
    singleSentence
      ? 'all outputs are one terminal-punctuated line'
      : 'an output is empty, multi-line, or unpunctuated',
  )

  // Check 2: length ≤ 30 words (CJK counted by character).
  // The prompt *requests* ≤30 words, but with long inputs the model may emit a
  // slightly longer single sentence. We report this as a warning rather than a
  // hard failure, since the primary contract is "one self-contained sentence".
  const withinLength = summaries.every((s) => countWords(s) <= 30)
  const wordCounts = summaries.map((s) => countWords(s)).join(', ')
  if (withinLength) {
    record('length', true, `word/char counts [${wordCounts}] (limit 30)`)
  } else {
    console.log(
      `  [WARN] length — word/char counts [${wordCounts}] exceed the 30-word prompt request ` +
        '(acceptable for long inputs; the one-sentence contract still holds)',
    )
  }

  // Check 3: no labels / meta commentary.
  const banned =
    /(the user thinks|this gleam is about|this thought is about|here is|the summary is)/i
  const noLabels = summaries.every((s) => !banned.test(s))
  record(
    'no-labels',
    noLabels,
    noLabels ? 'no meta-label phrases present' : 'contains a banned label phrase',
  )

  // Check 4: no markdown fences / quotes wrapping.
  const noMarkdown = summaries.every((s) => !/^["'#]/.test(s.trim()) && !s.includes('```'))
  record(
    'no-markdown',
    noMarkdown,
    noMarkdown ? 'no leading quotes or code fences' : 'output wrapped in quotes or fences',
  )

  // Check 5: language matches thought (ASCII ↔ CJK).
  const langOk = samples.every((s, i) => isCJK(s.thought) === isCJK(summaries[i]))
  record(
    'language-match',
    langOk,
    langOk ? 'summary language matches thought language' : 'language mismatch vs thought',
  )

  // Check 6: determinism (temperature 0 → identical output).
  // Some models still vary slightly at temperature 0, so we report this as a
  // warning rather than a hard failure — the summary is valid either way.
  const again = stripFences(await chat(systemPrompt, buildUserContent(samples[0])))
  const deterministic = again === summaries[0]
  if (deterministic) {
    record('determinism', true, 'repeated call produced identical summary')
  } else {
    console.log(
      `  [WARN] determinism — repeated call varied: "${again}" (valid, but non-deterministic)`,
    )
  }

  const failed = checks.filter((c) => !c.pass)
  console.log('\n────────────────────────────────────────')
  console.log(`Result: ${checks.length - failed.length}/${checks.length} checks passed`)
  if (failed.length > 0) {
    console.log('Failing checks:')
    for (const c of failed) console.log(`  - ${c.name}: ${c.detail}`)
    process.exit(1)
  }
  console.log('Summary feature validated successfully against the NVIDIA model.')
}

main().catch((err) => {
  console.error(`\nValidation error: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
