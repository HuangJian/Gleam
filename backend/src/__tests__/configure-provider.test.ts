import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import { initDatabase } from '../database/index'
import { SqliteRepository } from '../repository/sqlite-repository'
import { TimelineService } from '../timeline/timeline'
import { SearchService } from '../search/search'
import { graphql, type GraphQLSchema } from 'graphql'
import { schema, type GraphQLContext } from '../graphql/schema'
import type { DB } from '../database'
import type { Database } from 'bun:sqlite'
import { existsSync, rmSync } from 'node:fs'

// ── Encryption setup ────────────────────────────────────
//
// GLEAM_BACKEND_SECRET must be set before any encrypt/decrypt call.

beforeAll(() => {
  process.env.GLEAM_BACKEND_SECRET = 'test-resolver-secret-0123456789abcdef'
})

// ── Gateway mock ────────────────────────────────────────
//
// configureProvider validates the provider via createProviderForValidation,
// which would otherwise probe the OpenAI embeddings endpoint over the
// network. We stub it to a no-op validator so the resolver logic (persist +
// conditional reset) is exercised without I/O.

const validateConfig = mock(() => Promise.resolve())
mock.module('../gateway', () => ({
  createProviderForValidation: () => ({ validateConfig }),
  createProvider: () => ({ validateConfig }),
}))

// ── Test fixtures ───────────────────────────────────────

const TEST_DB = './data/test-resolver.sqlite'

let db: DB
let sqlite: Database
let repo: SqliteRepository
let context: GraphQLContext

function makeContext(): GraphQLContext {
  return {
    repository: repo,
    intelligenceRepository: repo,
    timelineService: new TimelineService(repo),
    searchService: new SearchService(repo),
  }
}

function makeGleam(id: string) {
  return {
    id,
    thought: 'A flash of understanding.',
    source: {
      type: 'url' as const,
      url: 'https://example.com/article',
      title: 'Example Article',
      excerpt: 'An excerpt.',
    },
    createdAt: '2026-07-14T10:00:00.000Z',
    tags: [],
    revisitCount: 0,
    lastRevisitedAt: '',
  }
}

const CONFIGURE_PROVIDER = /* GraphQL */ `
  mutation ConfigureProvider(
    $provider: String!
    $model: String!
    $embeddingModel: String!
    $apiKey: String!
  ) {
    configureProvider(
      input: {
        provider: $provider
        model: $model
        embeddingModel: $embeddingModel
        apiKey: $apiKey
      }
    ) {
      provider
      model
      success
    }
  }
`

beforeEach(() => {
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { force: true })
  if (existsSync(`${TEST_DB}-wal`)) rmSync(`${TEST_DB}-wal`, { force: true })
  if (existsSync(`${TEST_DB}-shm`)) rmSync(`${TEST_DB}-shm`, { force: true })

  const result = initDatabase(TEST_DB)
  db = result.db
  sqlite = result.sqlite
  repo = new SqliteRepository(db, sqlite)
  context = makeContext()
  validateConfig.mockClear()
})

afterEach(() => {
  sqlite.close()
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { force: true })
  if (existsSync(`${TEST_DB}-wal`)) rmSync(`${TEST_DB}-wal`, { force: true })
  if (existsSync(`${TEST_DB}-shm`)) rmSync(`${TEST_DB}-shm`, { force: true })
})

async function configure(
  provider: string,
  model: string,
  embeddingModel: string,
  apiKey: string,
): Promise<void> {
  const res = await graphql({
    schema: schema as GraphQLSchema,
    source: CONFIGURE_PROVIDER,
    variableValues: { provider, model, embeddingModel, apiKey },
    contextValue: context,
  })
  if (res.errors && res.errors.length > 0) {
    throw res.errors[0]
  }
}

describe('configureProvider resolver', () => {
  test('persists embeddingModel on first save', async () => {
    await configure('openai', 'gpt-4o-mini', 'text-embedding-3-small', 'sk-test')

    const stored = await repo.getIntelligenceConfig()
    expect(stored).not.toBeNull()
    expect(stored!.embeddingModel).toBe('text-embedding-3-small')
  })

  test('same embeddingModel on update does NOT reset embeddings', async () => {
    await configure('openai', 'gpt-4o-mini', 'text-embedding-3-small', 'sk-test')

    // Seed a gleam with a completed embedding.
    await repo.appendGleams([makeGleam('01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f')])
    await repo.createGleamAI('01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f')
    await repo.setArtifactStatus('01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f', 'embedding', 'completed')

    // Re-configure with the SAME embedding model.
    await configure('openai', 'gpt-4o-mini', 'text-embedding-3-small', 'sk-test2')

    const pending = await repo.findPendingArtifacts(100)
    const embeddingPending = pending.filter((p) => p.artifact === 'embedding')
    expect(embeddingPending).toHaveLength(0)
  })

  test('different embeddingModel on update DOES reset all embeddings', async () => {
    await configure('openai', 'gpt-4o-mini', 'text-embedding-3-small', 'sk-test')

    await repo.appendGleams([makeGleam('01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f')])
    await repo.createGleamAI('01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f')
    await repo.setArtifactStatus('01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f', 'embedding', 'completed')

    // Re-configure with a DIFFERENT embedding model.
    await configure('openai', 'gpt-4o-mini', 'text-embedding-3-large', 'sk-test2')

    const stored = await repo.getIntelligenceConfig()
    expect(stored!.embeddingModel).toBe('text-embedding-3-large')

    const pending = await repo.findPendingArtifacts(100)
    const embeddingPending = pending.filter((p) => p.artifact === 'embedding')
    expect(embeddingPending.map((p) => p.gleamId)).toEqual(['01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f'])
  })

  test('getIntelligenceConfigView exposes resolved embeddingModel', async () => {
    await configure('openai', 'gpt-4o-mini', 'text-embedding-3-small', 'sk-test')
    const view = await repo.getIntelligenceConfigView()
    expect(view!.embeddingModel).toBe('text-embedding-3-small')
  })
})
