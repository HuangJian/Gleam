import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { initDatabase } from '../database/index'
import { SqliteRepository } from '../repository/sqlite-repository'
import { PromptRegistry } from '../intelligence/prompt-registry'
import { ObservationPipeline } from '../intelligence/pipeline'
import { MockProvider } from './mock-provider'
import type { DB } from '../database'
import type { Database } from 'bun:sqlite'
import type { Gleam } from '../domain/gleam'
import { existsSync, rmSync } from 'node:fs'

// ── Test fixtures ───────────────────────────────────────

const TEST_DB = './data/test-pipeline.sqlite'
const PROMPTS_DIR = './prompts'

let db: DB
let sqlite: Database
let repo: SqliteRepository
let promptRegistry: PromptRegistry
let pipeline: ObservationPipeline
let provider: MockProvider

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

  // relationThreshold=0.5 so the topic-vector mock embeddings (similarity
  // 1.0 for matching topics, 0.0 for disjoint) reliably produce relations.
  pipeline = new ObservationPipeline(repo, promptRegistry, 0.5, 20)
  provider = new MockProvider()
})

afterEach(() => {
  sqlite.close()
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { force: true })
  if (existsSync(`${TEST_DB}-wal`)) rmSync(`${TEST_DB}-wal`, { force: true })
  if (existsSync(`${TEST_DB}-shm`)) rmSync(`${TEST_DB}-shm`, { force: true })
})

// ── Full observation ────────────────────────────────────

describe('ObservationPipeline.observe — full observation', () => {
  test('produces all four artifacts for a new gleam', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])
    await repo.createGleamAI(gleam.id)

    await pipeline.observe(gleam, provider)

    const ai = await repo.getGleamAI(gleam.id)
    expect(ai).not.toBeNull()
    expect(ai!.summaryStatus).toBe('completed')
    expect(ai!.tagStatus).toBe('completed')
    expect(ai!.embeddingStatus).toBe('completed')
    expect(ai!.relationStatus).toBe('completed')

    // Summary content
    expect(ai!.summary).toBe('Summary: React hooks are powerful.')

    // Tags — 'react' and 'testing' appear in thought/title? No, just 'react'.
    expect(ai!.tags).toEqual(['react'])

    // Embedding
    expect(ai!.embedding).not.toBeNull()
    expect(ai!.embeddingDimensions).toBe(8)
    expect(ai!.embeddingModel).toBe('mock-embedding-model')
  })

  test('records provider and model provenance', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])
    await repo.createGleamAI(gleam.id)

    await pipeline.observe(gleam, provider)

    const ai = await repo.getGleamAI(gleam.id)
    expect(ai!.provider).toBe('mock')
    expect(ai!.model).toBe('mock-chat-model')

    // Prompt versions from the registry
    expect(ai!.summaryVersion).toBe('v1')
    expect(ai!.tagVersion).toBe('v1')
    expect(ai!.relationVersion).toBe('v1')
  })
})

// ── Idempotency ─────────────────────────────────────────

describe('ObservationPipeline.observe — idempotency', () => {
  test('skips stages that are already completed', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])
    await repo.createGleamAI(gleam.id)

    // First observation — all stages run.
    await pipeline.observe(gleam, provider)
    const ai1 = await repo.getGleamAI(gleam.id)
    expect(ai1!.summaryStatus).toBe('completed')

    // Sabotage the provider — if stages re-run, they'd produce different
    // results or fail. Completed artifacts must remain untouched.
    provider.failSummary = true
    provider.failTags = true
    provider.failEmbedding = true

    await pipeline.observe(gleam, provider)

    const ai2 = await repo.getGleamAI(gleam.id)
    // Statuses remain completed — stages were skipped.
    expect(ai2!.summaryStatus).toBe('completed')
    expect(ai2!.tagStatus).toBe('completed')
    expect(ai2!.embeddingStatus).toBe('completed')
    expect(ai2!.relationStatus).toBe('completed')
    // Content unchanged.
    expect(ai2!.summary).toBe(ai1!.summary)
    expect(ai2!.tags).toEqual(ai1!.tags)
  })
})

// ── Stage failure isolation ─────────────────────────────

describe('ObservationPipeline.observe — failure isolation', () => {
  test('summary failure does not block embedding or tags', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])
    await repo.createGleamAI(gleam.id)

    provider.failSummary = true
    await pipeline.observe(gleam, provider)

    const ai = await repo.getGleamAI(gleam.id)
    expect(ai!.summaryStatus).toBe('failed')
    expect(ai!.summaryRetryCount).toBe(1)
    expect(ai!.tagStatus).toBe('completed')
    expect(ai!.embeddingStatus).toBe('completed')
  })

  test('embedding failure skips relation stage', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])
    await repo.createGleamAI(gleam.id)

    provider.failEmbedding = true
    await pipeline.observe(gleam, provider)

    const ai = await repo.getGleamAI(gleam.id)
    expect(ai!.embeddingStatus).toBe('failed')
    // Summary and tags are independent — they still succeed.
    expect(ai!.summaryStatus).toBe('completed')
    expect(ai!.tagStatus).toBe('completed')
    // Relation depends on embedding — must be skipped, not failed.
    expect(ai!.relationStatus).toBe('pending')
  })

  test('tag failure does not block summary or embedding', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])
    await repo.createGleamAI(gleam.id)

    provider.failTags = true
    await pipeline.observe(gleam, provider)

    const ai = await repo.getGleamAI(gleam.id)
    expect(ai!.tagStatus).toBe('failed')
    expect(ai!.tagRetryCount).toBe(1)
    expect(ai!.summaryStatus).toBe('completed')
    expect(ai!.embeddingStatus).toBe('completed')
  })
})

// ── Relations ───────────────────────────────────────────

describe('ObservationPipeline.observe — relations', () => {
  test('creates semantic_proximity relation between topically similar gleams', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'React hooks changed how I think about state.',
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'React composition patterns are elegant.',
      createdAt: '2026-07-15T10:00:00.000Z',
    })
    await repo.appendGleams([g1, g2])
    await repo.createGleamAI(g1.id)
    await repo.createGleamAI(g2.id)

    // Observe g1 first — at this point g2 has no embedding, so g1's
    // Relation Stage finds no similar gleams (0 relations).
    await pipeline.observe(g1, provider)

    // Observe g2 — g1 already has an embedding, so g2's Relation Stage
    // creates a relation g2 → g1 (cosine similarity = 1.0, both mention
    // 'react').
    await pipeline.observe(g2, provider)

    // g2 should have a relation pointing to g1.
    const relationsG2 = await repo.getRelations(g2.id)
    expect(relationsG2.length).toBe(1)
    expect(relationsG2[0].targetGleamId).toBe(g1.id)
    expect(relationsG2[0].relationType).toBe('semantic_proximity')
    expect(relationsG2[0].strength).toBeCloseTo(1.0, 5)
    expect(relationsG2[0].origin).toBe('ai')

    // Re-observe g1 to pick up the new relation to g2. The relation
    // status must be reset to 'pending' since the stage is idempotent.
    await repo.setArtifactStatus(g1.id, 'relation', 'pending')
    await pipeline.observe(g1, provider)

    // Now g1 should also have a relation pointing to g2.
    const relationsG1 = await repo.getRelations(g1.id)
    expect(relationsG1.length).toBe(1)
    expect(relationsG1[0].targetGleamId).toBe(g2.id)
    expect(relationsG1[0].strength).toBeCloseTo(1.0, 5)
  })

  test('does not create relation for topically disjoint gleams', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'React hooks changed how I think about state.',
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'Philosophy of mind explores consciousness.',
      createdAt: '2026-07-15T10:00:00.000Z',
    })
    await repo.appendGleams([g1, g2])
    await repo.createGleamAI(g1.id)
    await repo.createGleamAI(g2.id)

    await pipeline.observe(g1, provider)
    await pipeline.observe(g2, provider)

    // 'react' and 'philosophy' are disjoint → cosine similarity = 0.0
    // → no relation (threshold is 0.5).
    const relationsG1 = await repo.getRelations(g1.id)
    expect(relationsG1.length).toBe(0)
  })

  test('replaces AI relations on re-observation (does not duplicate)', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'React hooks changed how I think about state.',
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'React composition patterns are elegant.',
      createdAt: '2026-07-15T10:00:00.000Z',
    })
    await repo.appendGleams([g1, g2])
    await repo.createGleamAI(g1.id)
    await repo.createGleamAI(g2.id)

    // First observation.
    await pipeline.observe(g1, provider)
    await pipeline.observe(g2, provider)

    // Force re-observation of g1 by resetting relation status.
    await repo.setArtifactStatus(g1.id, 'relation', 'pending')
    await pipeline.observe(g1, provider)

    // Should still have exactly 1 relation (replaced, not duplicated).
    const relations = await repo.getRelations(g1.id)
    expect(relations.length).toBe(1)
    expect(relations[0].targetGleamId).toBe(g2.id)
  })
})
