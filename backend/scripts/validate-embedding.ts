/**
 * Standalone validation script for the embedding feature against the
 * NVIDIA Nemotron-3-Embed-1B model hosted on build.nvidia.com.
 *
 * Run with:
 *   NVIDIA_LLM_API_KEY=<key> bun run backend/scripts/validate-embedding.ts
 *
 * The script mirrors the text-construction logic used by the production
 * `OpenAICompatibleProvider.generateEmbedding` (see backend/src/gateway/openai-compatible-provider.ts)
 * so the validated request shape matches what the Intelligence pipeline sends.
 *
 * It performs no database writes — it only exercises the model endpoint and
 * asserts the response is usable by the storage path (Float32 BLOB of 2048 dims).
 */

const ENDPOINT = 'https://integrate.api.nvidia.com/v1/embeddings'
const MODEL = 'nvidia/nemotron-3-embed-1b'
const EXPECTED_DIMENSIONS = 2048

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

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>
  model?: string
  object?: string
  usage?: { prompt_tokens?: number; total_tokens?: number }
}

// ── Helpers ────────────────────────────────────────────

/** Mirrors `buildEmbeddingText` in openai-compatible-provider.ts (thought weighted 3×). */
const THOUGHT_EMBEDDING_WEIGHT = 3

function buildEmbeddingText(input: LLMInput): string {
  const parts: string[] = []
  for (let i = 0; i < THOUGHT_EMBEDDING_WEIGHT; i++) parts.push(input.thought)
  if (input.source.title) parts.push(input.source.title)
  if (input.source.excerpt) parts.push(input.source.excerpt)
  return parts.join('\n')
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`dimension mismatch: ${a.length} vs ${b.length}`)
  }
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function l2Norm(v: number[]): number {
  return Math.sqrt(v.reduce((acc, x) => acc + x * x, 0))
}

// ── Endpoint call ──────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.NVIDIA_LLM_API_KEY
  if (!apiKey) {
    throw new Error('NVIDIA_LLM_API_KEY environment variable is not set')
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: text,
      input_type: 'passage',
      encoding_format: 'float',
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const snippet = body.length > 300 ? body.slice(0, 300) + '…' : body
    if (res.status === 401) {
      throw new Error(`Authentication failed (401). Check NVIDIA_LLM_API_KEY. ${snippet}`)
    }
    throw new Error(`Embedding request failed: ${res.status} ${res.statusText} ${snippet}`)
  }

  const data = (await res.json()) as EmbeddingResponse
  const vec = data.data?.[0]?.embedding
  if (!vec || vec.length === 0) {
    throw new Error('Model returned an empty embedding vector')
  }
  return vec
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
  const mark = pass ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name} — ${detail}`)
}

async function main() {
  console.log(`Validating embedding feature against ${MODEL}`)
  console.log(`Endpoint: ${ENDPOINT}\n`)

  // Sample Gleam-like inputs (thought + source context).
  // Since `thought` is weighted 3×, similarity is driven by the thought text,
  // so the samples are chosen so the thought topics clearly demonstrate ordering:
  // samples 0 & 1 are about caching/memoization (similar); sample 2 is biology (dissimilar).
  const samples: LLMInput[] = [
    {
      thought: 'Caching improves application performance by avoiding repeated computation.',
      source: {
        type: 'url',
        url: 'https://example.com/caching',
        title: 'Performance Patterns',
        excerpt: 'A cache stores results keyed by inputs to skip expensive work.',
      },
    },
    {
      thought: 'Memoization speeds up functions by storing previously computed results.',
      source: {
        type: 'book',
        url: '',
        title: 'Structure and Interpretation of Computer Programs',
        excerpt: 'Remembering past answers is a classic space-for-time tradeoff.',
      },
    },
    {
      thought: 'The mitochondria is the powerhouse of the cell, producing ATP.',
      source: {
        type: 'book',
        url: '',
        title: 'Biology Textbook',
        excerpt: 'Chloroplasts capture photons to synthesize glucose from CO2 and water.',
      },
    },
  ]

  const texts = samples.map(buildEmbeddingText)
  console.log(`Embedding ${texts.length} sample inputs...\n`)

  const vectors: number[][] = []
  for (let i = 0; i < texts.length; i++) {
    const vec = await generateEmbedding(texts[i])
    vectors.push(vec)
    console.log(`  sample ${i + 1}: ${vec.length}-dim vector, L2 norm ${l2Norm(vec).toFixed(4)}`)
  }

  // Check 1: dimensions match model card.
  const dims = new Set(vectors.map((v) => v.length))
  record(
    'dimensions',
    dims.size === 1 && dims.has(EXPECTED_DIMENSIONS),
    dims.size === 1
      ? `all vectors are ${[...dims][0]}-dimensional (expected ${EXPECTED_DIMENSIONS})`
      : `inconsistent dimensions: ${[...dims].join(', ')}`,
  )

  // Check 2: storage compatibility — wrap as Float32 BLOB like the repo does.
  const okStorage = vectors.every((v) => {
    const f32 = new Float32Array(v)
    const buf = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)
    return buf.length === EXPECTED_DIMENSIONS * 4
  })
  record(
    'storage-compat',
    okStorage,
    `Float32 BLOB is ${EXPECTED_DIMENSIONS * 4} bytes per vector (matches schema expectation)`,
  )

  // Check 3: determinism — same input yields a stable vector.
  // The serving stack applies float rounding, so we allow a tiny tolerance
  // (max abs diff < 1e-4) rather than requiring bit-exact equality.
  const again = await generateEmbedding(texts[0])
  let maxAbsDiff = 0
  for (let i = 0; i < vectors[0].length; i++) {
    maxAbsDiff = Math.max(maxAbsDiff, Math.abs(vectors[0][i] - again[i]))
  }
  const deterministic = maxAbsDiff < 1e-4
  record(
    'determinism',
    deterministic,
    deterministic
      ? `repeated call stable (max abs diff ${maxAbsDiff.toExponential(2)})`
      : `vector changed across calls (max abs diff ${maxAbsDiff.toExponential(2)})`,
  )

  // Check 4: semantic quality — similar texts score higher than dissimilar ones.
  const simSimilar = cosineSimilarity(vectors[0], vectors[1]) // FP / immutability vs pure functions
  const simDissimilar = cosineSimilarity(vectors[0], vectors[2]) // FP vs photosynthesis
  record(
    'semantic-ordering',
    simSimilar > simDissimilar,
    `similar pair cos=${simSimilar.toFixed(4)} > dissimilar pair cos=${simDissimilar.toFixed(4)}`,
  )

  // Check 5: vectors are not degenerate (non-zero, finite).
  const finite = vectors.every((v) => v.every((x) => Number.isFinite(x) && x !== 0))
  record(
    'non-degenerate',
    finite,
    finite ? 'all values finite and non-zero' : 'contains zero or non-finite values',
  )

  // Summary
  const failed = checks.filter((c) => !c.pass)
  console.log('\n────────────────────────────────────────')
  console.log(`Result: ${checks.length - failed.length}/${checks.length} checks passed`)
  if (failed.length > 0) {
    console.log('Failing checks:')
    for (const c of failed) console.log(`  - ${c.name}: ${c.detail}`)
    process.exit(1)
  }
  console.log('Embedding feature validated successfully against the NVIDIA model.')
}

main().catch((err) => {
  console.error(`\nValidation error: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
