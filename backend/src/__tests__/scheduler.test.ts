import { describe, test, expect, beforeEach, afterEach, beforeAll } from 'bun:test'
import { initDatabase } from '../database/index'
import { SqliteRepository } from '../repository/sqlite-repository'
import { PromptRegistry } from '../intelligence/prompt-registry'
import { ObservationPipeline } from '../intelligence/pipeline'
import { Scheduler } from '../intelligence/scheduler'
import { encrypt } from '../config/encryption'
import type { DB } from '../database'
import type { Database } from 'bun:sqlite'
import type { Gleam } from '../domain/gleam'
import type { LLMProvider } from '../gateway/llm-provider'
import type { IIntelligenceRepository } from '../repository/repository'
import { existsSync, rmSync } from 'node:fs'

// ── Encryption setup ────────────────────────────────────
//
// GLEAM_BACKEND_SECRET must be set before any encrypt/decrypt call so the
// scheduler can construct a provider from the stored config. The
// actual API key is never used (the tracking pipeline ignores the
// provider), but decrypt() must succeed.

beforeAll(() => {
  process.env.GLEAM_BACKEND_SECRET = 'test-scheduler-secret-0123456789abcdef'
})

// ── Test fixtures ───────────────────────────────────────

const TEST_DB = './data/test-scheduler.sqlite'
const PROMPTS_DIR = './prompts'

let db: DB
let sqlite: Database
let repo: SqliteRepository
let promptRegistry: PromptRegistry
let pipeline: TrackingPipeline
let scheduler: Scheduler

function makeGleam(overrides: Partial<Gleam> = {}): Gleam {
  return {
    id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
    thought: 'React hooks are powerful.',
    source: {
      type: 'url',
      url: 'https://example.com/react',
      title: 'React Docs',
      excerpt: 'A guide to React hooks.',
    },
    createdAt: '2026-07-14T10:00:00.000Z',
    tags: [],
    revisitCount: 0,
    lastRevisitedAt: '',
    ...overrides,
  }
}

/**
 * Test double for ObservationPipeline.
 *
 * Extends the real class to satisfy the Scheduler's type constraint,
 * but overrides `observe()` to record calls without invoking the LLM
 * provider. Supports an optional delay for testing the observation lock.
 */
class TrackingPipeline extends ObservationPipeline {
  observedGleamIds: string[] = []
  observeDelayMs = 0

  constructor(repository: IIntelligenceRepository, registry: PromptRegistry) {
    super(repository, registry, 0.5, 20)
  }

  override async observe(gleam: Gleam, _provider: LLMProvider): Promise<void> {
    if (this.observeDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.observeDelayMs))
    }
    this.observedGleamIds.push(gleam.id)
  }
}

beforeEach(() => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { force: true })
  if (existsSync(`${TEST_DB}-wal`)) rmSync(`${TEST_DB}-wal`, { force: true })
  if (existsSync(`${TEST_DB}-shm`)) rmSync(`${TEST_DB}-shm`, { force: true })

  const result = initDatabase(TEST_DB)
  db = result.db
  sqlite = result.sqlite
  repo = new SqliteRepository(db, sqlite)

  promptRegistry = new PromptRegistry(PROMPTS_DIR)
  promptRegistry.load()

  pipeline = new TrackingPipeline(repo, promptRegistry)
  // intervalMs and batchSize are irrelevant — tests call tick() directly.
  scheduler = new Scheduler(repo, repo, pipeline, 30_000, 10)
})

afterEach(() => {
  sqlite.close()
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { force: true })
  if (existsSync(`${TEST_DB}-wal`)) rmSync(`${TEST_DB}-wal`, { force: true })
  if (existsSync(`${TEST_DB}-shm`)) rmSync(`${TEST_DB}-shm`, { force: true })
})

// ── No provider configured ──────────────────────────────

describe('Scheduler.tick — no provider configured', () => {
  test('returns 0 and does not create gleam_ai rows', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])

    const result = await scheduler.tick()
    expect(result).toBe(0)

    // No gleam_ai row should be created when no provider is configured.
    const ai = await repo.getGleamAI(gleam.id)
    expect(ai).toBeNull()
  })
})

// ── Unobserved gleams ───────────────────────────────────

describe('Scheduler.tick — discovers unobserved gleams', () => {
  test('creates gleam_ai rows for gleams without observation records', async () => {
    // Save a provider config so the scheduler proceeds past the config check.
    await saveProviderConfig(repo)

    const g1 = makeGleam({ id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f' })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      createdAt: '2026-07-15T10:00:00.000Z',
    })
    await repo.appendGleams([g1, g2])

    await scheduler.tick()

    // Both gleams should now have gleam_ai rows (status: pending).
    const ai1 = await repo.getGleamAI(g1.id)
    const ai2 = await repo.getGleamAI(g2.id)
    expect(ai1).not.toBeNull()
    expect(ai2).not.toBeNull()
    expect(ai1!.summaryStatus).toBe('pending')
    expect(ai2!.summaryStatus).toBe('pending')
  })
})

// ── Pending artifacts ───────────────────────────────────

describe('Scheduler.tick — observes pending artifacts', () => {
  test('calls pipeline.observe for gleams with pending artifacts', async () => {
    await saveProviderConfig(repo)

    const g1 = makeGleam({ id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f' })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      createdAt: '2026-07-15T10:00:00.000Z',
    })
    await repo.appendGleams([g1, g2])

    // Pre-create gleam_ai rows so the scheduler finds pending artifacts
    // directly (rather than discovering unobserved gleams first).
    await repo.createGleamAI(g1.id)
    await repo.createGleamAI(g2.id)

    const result = await scheduler.tick()
    expect(result).toBe(2)
    expect(pipeline.observedGleamIds).toContain(g1.id)
    expect(pipeline.observedGleamIds).toContain(g2.id)
  })

  test('returns 0 when no pending work exists', async () => {
    await saveProviderConfig(repo)

    const gleam = makeGleam()
    await repo.appendGleams([gleam])
    await repo.createGleamAI(gleam.id)

    // Mark all artifacts as completed — nothing pending.
    await repo.setArtifactStatus(gleam.id, 'summary', 'completed')
    await repo.setArtifactStatus(gleam.id, 'tags', 'completed')
    await repo.setArtifactStatus(gleam.id, 'embedding', 'completed')
    await repo.setArtifactStatus(gleam.id, 'relation', 'completed')

    const result = await scheduler.tick()
    expect(result).toBe(0)
    expect(pipeline.observedGleamIds).toHaveLength(0)
  })
})

// ── Observation lock ────────────────────────────────────

describe('Scheduler.tick — observation lock', () => {
  test('skips concurrent tick when already running', async () => {
    await saveProviderConfig(repo)

    const gleam = makeGleam()
    await repo.appendGleams([gleam])
    await repo.createGleamAI(gleam.id)

    // Introduce a delay so the first tick is still in progress when
    // the second tick is called.
    pipeline.observeDelayMs = 50

    // Start the first tick — it sets running=true synchronously,
    // then awaits the delayed pipeline.observe().
    const p1 = scheduler.tick()

    // The second tick should see running=true and return 0 immediately.
    const result2 = await scheduler.tick()
    expect(result2).toBe(0)

    // Wait for the first tick to finish.
    const result1 = await p1
    expect(result1).toBe(1)
    expect(pipeline.observedGleamIds).toEqual([gleam.id])
  })
})

// ── Recovery ────────────────────────────────────────────

describe('Scheduler recovery (recoverRunningObservations)', () => {
  test('resets stale running observations to pending', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])
    await repo.createGleamAI(gleam.id)

    // Simulate a crash mid-observation: set artifacts to 'running'.
    await repo.setArtifactStatus(gleam.id, 'summary', 'running')
    await repo.setArtifactStatus(gleam.id, 'embedding', 'running')

    const recovered = await repo.recoverRunningObservations()
    expect(recovered).toBe(2)

    const ai = await repo.getGleamAI(gleam.id)
    expect(ai!.summaryStatus).toBe('pending')
    expect(ai!.embeddingStatus).toBe('pending')
    // Tags and relation were never set to running — they remain pending.
    expect(ai!.tagStatus).toBe('pending')
    expect(ai!.relationStatus).toBe('pending')
  })

  test('leaves completed and failed artifacts untouched', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])
    await repo.createGleamAI(gleam.id)

    await repo.setArtifactStatus(gleam.id, 'summary', 'completed')
    await repo.setArtifactStatus(gleam.id, 'tags', 'failed')
    await repo.setArtifactStatus(gleam.id, 'embedding', 'running')

    const recovered = await repo.recoverRunningObservations()
    expect(recovered).toBe(1)

    const ai = await repo.getGleamAI(gleam.id)
    expect(ai!.summaryStatus).toBe('completed')
    expect(ai!.tagStatus).toBe('failed')
    expect(ai!.embeddingStatus).toBe('pending')
  })
})

// ── Helpers ─────────────────────────────────────────────

/**
 * Saves a valid IntelligenceConfig to the repository.
 *
 * The API key is encrypted with GLEAM_BACKEND_SECRET (set in beforeAll). The
 * scheduler will decrypt it and construct an OpenAICompatibleProvider — but
 * the TrackingPipeline ignores the provider, so no HTTP requests
 * are made.
 */
async function saveProviderConfig(repository: SqliteRepository): Promise<void> {
  const encrypted = encrypt('test-api-key-not-used')
  await repository.saveIntelligenceConfig({
    provider: 'openai',
    model: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    endpoint: 'https://api.openai.com',
    encryptedApiKey: encrypted.ciphertext,
    apiKeyIv: encrypted.iv,
    reasoningSuppression: false,
    updatedAt: new Date().toISOString(),
  })
}
