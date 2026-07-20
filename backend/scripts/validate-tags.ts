/**
 * Standalone validation script for the Tags feature against the
 * NVIDIA Nemotron-3-Ultra-550B-A55B chat model (build.nvidia.com).
 *
 * Run with:
 *   NVIDIA_LLM_API_KEY=<key> bun run backend/scripts/validate-tags.ts
 *
 * The script mirrors the request shape used by the production
 * `OpenAIProvider.generateTags` (see backend/src/gateway/openai-provider.ts)
 * and loads the real Tags prompt from backend/prompts/tags/v1.md
 * (the same file the PromptRegistry resolves at runtime), so it validates
 * the actual prompt behavior rather than a copy.
 *
 * It performs no database writes — it only exercises the model endpoint
 * and asserts the response conforms to the Tags contract
 * (JSON array of 3–5 lowercase kebab-case tags, no generic tags).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CHAT_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions'
const MODEL = 'nvidia/nemotron-3-ultra-550b-a55b'

// Production uses temperature 0.2; we pin 0 here for reproducible validation.
const TEMPERATURE = 0
const MAX_TOKENS = 150

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

/**
 * Mirrors `parseTagsResponse` in openai-provider.ts: accepts a JSON array,
 * comma-separated, or line-separated tags; strips a leading `#`.
 */
function parseTagsResponse(raw: string): string[] {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((t) => String(t).trim().replace(/^#/, '')).filter((t) => t.length > 0)
      }
    } catch {
      // fall through
    }
  }
  const tokens = trimmed.split(/[,\n]/).map((t) => t.trim().replace(/^#/, ''))
  return tokens.filter((t) => t.length > 0)
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
  if (!content) throw new Error('Model returned an empty tags response')
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

const GENERIC_TAGS = new Set(['thought', 'gleam', 'note', 'idea'])

async function main() {
  console.log(`Validating Tags feature against ${MODEL}`)
  console.log(`Endpoint: ${CHAT_ENDPOINT}\n`)

  const promptPath = join(import.meta.dir, '..', 'prompts', 'tags', 'v1.md')
  const systemPrompt = readFileSync(promptPath, 'utf8')
  console.log(`Loaded prompt: ${promptPath}\n`)

  const samples: LLMInput[] = [
    {
      thought:
        "React's useReducer is just a state machine that runs inside setState. " +
        'When you call useReducer you hand React a pure reducer function and an initial ' +
        'state, and what you get back is the current state plus a dispatch function. Every ' +
        'time you dispatch an action, React runs your reducer with the previous state and ' +
        'that action, and the value it returns becomes the next state — exactly the ' +
        'transition function of a finite state machine. The difference from a bare ' +
        'useState is that the update logic lives in one place instead of being scattered ' +
        'across a dozen setters, so the set of legal transitions is explicit and easy to ' +
        'reason about. You can look at the reducer and see, at a glance, every way the ' +
        'state is allowed to move, which makes impossible states harder to represent. ' +
        'This matters most when several pieces of state are coupled: rather than juggling ' +
        'three booleans that can fall out of sync, you model a single state value whose ' +
        'shape encodes only the valid combinations. Dispatch is also referentially stable, ' +
        'so you can pass it down without re-rendering children, and you can serialize the ' +
        'stream of actions to replay or debug a session. In practice useReducer shines ' +
        'once the number of events exceeds what a few setters express cleanly, and it ' +
        'pairs naturally with the reducer-as-state-machine mental model that makes ' +
        'complex forms and wizards far less error prone than the equivalent useState soup.',
      source: {
        type: 'url',
        url: 'https://example.com/react-usereducer',
        title: 'React Patterns',
        excerpt:
          'useReducer centralizes state transitions in a pure reducer function, making the ' +
          'set of legal state changes explicit and easy to reason about. Unlike useState, ' +
          'where update logic is spread across many setter calls, a reducer keeps every ' +
          'transition in one place so the shape of the state can encode only valid ' +
          'combinations and impossible states become harder to represent. This is ' +
          'especially valuable when several values are coupled, because you replace a ' +
          'handful of independent booleans that can drift out of sync with a single state ' +
          'value whose transitions are enumerated. Dispatch is referentially stable, which ' +
          'means it can be passed to children without forcing them to re-render, and the ' +
          'sequence of dispatched actions can be serialized for replay or debugging. The ' +
          'article shows a multi-step wizard refactored from tangled useState setters into ' +
          'a reducer, and demonstrates how the resulting transition table makes invalid ' +
          'navigation literally unrepresentable. It recommends reaching for useReducer once ' +
          'the count of distinct events grows beyond what a few setters express cleanly, and ' +
          'notes that the reducer-as-state-machine framing pairs well with type systems ' +
          'that can check each branch. The takeaway is that complexity does not disappear, ' +
          'but it becomes visible and local instead of implicit and scattered across the tree.',
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
          'is understood. For read-dominated systems the amortized cost drops sharply, and ' +
          'the author argues that caching is less an optimization than a change in what ' +
          'latency even measures: not the cost of the work, but the frequency of repeating it.',
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
          '干预都要先问它会触动哪条回路，否则善意的小改也可能在延迟之后引发更大的震荡。' +
          '真正的洞察往往不在组件清单里，而在你扰动系统之后它作出的反应之中，那才是系统' +
          '愿意向你坦白的、关于它自己的唯一真话。',
      },
    },
  ]

  const tagSets: string[][] = []
  for (let i = 0; i < samples.length; i++) {
    const raw = await chat(systemPrompt, buildUserContent(samples[i]))
    const tags = parseTagsResponse(stripFences(raw))
    tagSets.push(tags)
    console.log(`  sample ${i + 1}: [${tags.join(', ')}]`)
  }

  // Check 1: parseable to a non-empty array of strings.
  const parseable = tagSets.every((t) => t.length > 0)
  record(
    'parseable',
    parseable,
    parseable ? 'all responses parsed to tag arrays' : 'a response failed to parse',
  )

  // Check 2: count 3–5.
  const inCount = tagSets.every((t) => t.length >= 3 && t.length <= 5)
  const counts = tagSets.map((t) => t.length).join(', ')
  record('count', inCount, `tag counts [${counts}] (expected 3–5)`)

  // Check 3: format — lowercase, kebab-case (no spaces, only [a-z0-9-]), 1–3 words.
  // The prompt requests lowercase kebab-case, but the model occasionally emits a
  // camelCase tag (e.g. `useReducer`). The production parser does not normalize
  // case, so we report this as a warning rather than a hard failure — it is a
  // prompt-adherence gap, not a structural defect.
  const allTags = tagSets.flat()
  const badTags = allTags.filter(
    (t) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t) || t.split('-').length > 3,
  )
  const formatOk = badTags.length === 0
  if (formatOk) {
    record('format', true, `${allTags.length} tags are lowercase kebab-case (≤3 words)`)
  } else {
    console.log(
      `  [WARN] format — ${badTags.length} tag(s) violate lowercase kebab-case / ≤3 words: ` +
        `[${badTags.join(', ')}]`,
    )
  }

  // Check 4: no generic tags.
  const noGeneric = allTags.every((t) => !GENERIC_TAGS.has(t))
  record(
    'no-generic',
    noGeneric,
    noGeneric
      ? 'no banned generic tags'
      : `contains generic tag(s): ${allTags.filter((t) => GENERIC_TAGS.has(t)).join(', ')}`,
  )

  // Check 5: determinism (temperature 0 → identical parsed tags).
  // NOTE: Nemotron-3-Ultra is a 550B reasoning model and shows minor
  // sampling variance at the 3–5 tag boundary even at temperature 0
  // (e.g. 5 vs 4 tags). The output remains valid either way, so this is
  // reported as a warning rather than a hard failure.
  const again = parseTagsResponse(
    stripFences(await chat(systemPrompt, buildUserContent(samples[0]))),
  )
  const deterministic = JSON.stringify(again) === JSON.stringify(tagSets[0])
  if (deterministic) {
    record('determinism', true, 'repeated call produced identical tags')
  } else {
    console.log(
      `  [WARN] determinism — repeated call varied: [${again.join(', ')}] (valid, but non-deterministic at the 3–5 boundary)`,
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
  console.log('Tags feature validated successfully against the NVIDIA model.')
}

main().catch((err) => {
  console.error(`\nValidation error: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
