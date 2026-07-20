import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { SyncService } from '../services/sync'
import type {
  ServerClient,
  SearchResult,
  TimelineResult,
  AppendResult,
} from '../infra/server-client'
import type { IRepository, ILocalCache } from '../domain/repository'
import type { Gleam } from '../domain/gleam'
import type {
  GleamIntelligence,
  GleamRelation,
  IntelligenceConfigView,
} from '../domain/intelligence'

// ── Mock helpers ───────────────────────────────────────

function makeGleam(overrides: Partial<Gleam> = {}): Gleam {
  return {
    id: 'g1',
    thought: 'A flash of understanding.',
    source: { type: 'url', url: 'https://example.com', title: '', excerpt: '' },
    createdAt: '2026-07-14T10:00:00.000Z',
    tags: [],
    revisitCount: 0,
    lastRevisitedAt: '',
    ...overrides,
  }
}

function makeIntelligence(overrides: Partial<GleamIntelligence> = {}): GleamIntelligence {
  return { summary: null, aiTags: [], ...overrides }
}

function makeRelation(overrides: Partial<GleamRelation> = {}): GleamRelation {
  return {
    id: 'rel-001',
    targetGleam: { id: 'g2', thought: 'Related.', createdAt: '2026-07-14T12:00:00.000Z' },
    relationType: 'semantic_proximity',
    strength: 0.87,
    origin: 'ai',
    ...overrides,
  }
}

function createMockRepo(
  gleams: Gleam[] = [],
): IRepository & ILocalCache & { clearedIds: string[]; stored: Gleam[] } {
  let stored = [...gleams]
  const clearedIds: string[] = []
  return {
    clearedIds,
    stored,
    async save(gleam: Gleam) {
      stored.push(gleam)
    },
    async getById(id: string) {
      return stored.find((g) => g.id === id) ?? null
    },
    async getAll() {
      return [...stored]
    },
    async updateDerivedFields(id: string, updates: Partial<Gleam>) {
      const gleam = stored.find((g) => g.id === id)
      if (gleam) Object.assign(gleam, updates)
    },
    async renameTag(oldTag: string, newTag: string) {
      for (const g of stored) {
        if (g.tags.includes(oldTag)) {
          g.tags = Array.from(new Set(g.tags.filter((t) => t !== oldTag).concat(newTag)))
        }
      }
    },
    async clearSynced(ids: string[]) {
      clearedIds.push(...ids)
      stored = stored.filter((g) => !ids.includes(g.id))
    },
  } as IRepository & ILocalCache & { clearedIds: string[]; stored: Gleam[] }
}

function createMockServerClient(overrides: Partial<ServerClient> = {}): ServerClient {
  return {
    ping: mock(() => Promise.resolve(true)),
    appendGleams: mock(() =>
      Promise.resolve<AppendResult>({ accepted: 0, skipped: 0, rejected: 0, errors: [] }),
    ),
    search: mock(() => Promise.resolve<SearchResult>({ total: 0, items: [] })),
    getTimeline: mock(() =>
      Promise.resolve<TimelineResult>({ items: [], total: 0, hasMore: false }),
    ),
    updateDerivedFields: mock(() => Promise.resolve(true)),
    renameTag: mock(() => Promise.resolve(0)),
    getIntelligenceConfig: mock(() => Promise.resolve<IntelligenceConfigView | null>(null)),
    configureProvider: mock(() =>
      Promise.resolve({ provider: 'openai', model: 'gpt-4o-mini', success: true }),
    ),
    removeProvider: mock(() => Promise.resolve(true)),
    removeTag: mock(() => Promise.resolve(true)),
    regenerateArtifact: mock(() => Promise.resolve(true)),
    getGleamRelations: mock(() => Promise.resolve<GleamRelation[]>([])),
    ...overrides,
  } as unknown as ServerClient
}

// ── Tests ──────────────────────────────────────────────

describe('SyncService', () => {
  let repo: ReturnType<typeof createMockRepo>
  let serverClient: ServerClient
  let sync: SyncService
  const gmStore = new Map<string, unknown>()

  beforeEach(() => {
    gmStore.clear()
    ;(globalThis as unknown as Record<string, unknown>).GM_getValue = <T>(
      key: string,
      defaultValue?: T,
    ): T => (gmStore.get(key) as T) ?? (defaultValue as T)
    ;(globalThis as unknown as Record<string, unknown>).GM_setValue = (
      key: string,
      value: unknown,
    ): void => {
      gmStore.set(key, value)
    }

    repo = createMockRepo([])
    serverClient = createMockServerClient()
    sync = new SyncService(repo, serverClient)
  })

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).GM_getValue
    delete (globalThis as unknown as Record<string, unknown>).GM_setValue
  })

  // ── State & subscription ──

  test('initial state is disconnected with 0 pending', () => {
    const state = sync.getState()
    expect(state.status).toBe('disconnected')
    expect(state.pendingCount).toBe(0)
    expect(state.lastSyncAt).toBeNull()
    expect(state.error).toBeNull()
  })

  test('subscribe receives state updates', async () => {
    const states: SyncState[] = []
    const unsub = sync.subscribe((s) => states.push({ ...s }))

    await sync.testConnection()
    expect(states.length).toBeGreaterThan(0)
    expect(states[states.length - 1].status).toBe('connected')
    unsub()
  })

  test('subscribe returns unsubscribe function', () => {
    const unsub = sync.subscribe(() => {})
    expect(typeof unsub).toBe('function')
    unsub()
  })

  // ── testConnection ──

  test('testConnection returns true and sets connected status', async () => {
    const result = await sync.testConnection()
    expect(result).toBe(true)
    expect(sync.getState().status).toBe('connected')
  })

  test('testConnection returns false and sets disconnected on failure', async () => {
    serverClient = createMockServerClient({ ping: mock(() => Promise.resolve(false)) })
    sync = new SyncService(repo, serverClient)

    const result = await sync.testConnection()
    expect(result).toBe(false)
    expect(sync.getState().status).toBe('disconnected')
    expect(sync.getState().error).toContain('无法连接')
  })

  // ── syncPending ──

  test('syncPending returns empty result when no pending gleams', async () => {
    const result = await sync.syncPending()
    expect(result.uploaded).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.failed).toBe(0)
  })

  test('syncPending uploads pending gleams and clears them from local cache', async () => {
    const g1 = makeGleam({ id: 'g1' })
    const g2 = makeGleam({ id: 'g2' })
    repo = createMockRepo([g1, g2])
    serverClient = createMockServerClient({
      appendGleams: mock(() =>
        Promise.resolve<AppendResult>({
          accepted: 2,
          skipped: 0,
          rejected: 0,
          errors: [],
        }),
      ),
    })
    sync = new SyncService(repo, serverClient)

    const result = await sync.syncPending()
    expect(result.uploaded).toBe(2)
    expect(repo.clearedIds).toEqual(['g1', 'g2'])
    expect(sync.getState().pendingCount).toBe(0)
    expect(sync.getState().status).toBe('connected')
    expect(sync.getState().lastSyncAt).not.toBeNull()
  })

  test('syncPending keeps failed gleams in local cache', async () => {
    const g1 = makeGleam({ id: 'g1' })
    const g2 = makeGleam({ id: 'g2' })
    repo = createMockRepo([g1, g2])
    serverClient = createMockServerClient({
      appendGleams: mock(() =>
        Promise.resolve<AppendResult>({
          accepted: 1,
          skipped: 0,
          rejected: 1,
          errors: [{ id: 'g2', message: 'Invalid UUID' }],
        }),
      ),
    })
    sync = new SyncService(repo, serverClient)

    const result = await sync.syncPending()
    expect(result.uploaded).toBe(1)
    expect(result.failed).toBe(1)
    // g1 should be cleared, g2 should remain
    expect(repo.clearedIds).toEqual(['g1'])
    expect(sync.getState().pendingCount).toBe(1)
    expect(sync.getState().error).toContain('1 个 gleam 上传失败')
  })

  test('syncPending handles network error gracefully', async () => {
    const g1 = makeGleam({ id: 'g1' })
    repo = createMockRepo([g1])
    serverClient = createMockServerClient({
      appendGleams: mock(() => Promise.reject(new Error('Network error'))),
    })
    sync = new SyncService(repo, serverClient)

    const result = await sync.syncPending()
    expect(result.uploaded).toBe(0)
    expect(result.failed).toBe(1)
    expect(repo.clearedIds).toEqual([]) // nothing cleared
    expect(sync.getState().status).toBe('disconnected')
    expect(sync.getState().pendingCount).toBe(1)
  })

  // ── getTimeline (with fallback) ──

  test('getTimeline returns remote timeline on success', async () => {
    const g1 = makeGleam({ id: 'g1' })
    serverClient = createMockServerClient({
      getTimeline: mock(() =>
        Promise.resolve<TimelineResult>({
          items: [{ gleam: g1, intelligence: makeIntelligence() }],
          total: 1,
          hasMore: false,
        }),
      ),
    })
    sync = new SyncService(repo, serverClient)

    const result = await sync.getTimeline()
    expect(result.source).toBe('remote')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].gleam.id).toBe('g1')
    expect(result.items[0].intelligence.summary).toBeNull()
    expect(sync.getState().status).toBe('connected')
  })

  test('getTimeline falls back to local on server failure, wrapping with default intelligence', async () => {
    const g1 = makeGleam({ id: 'g1', createdAt: '2026-07-01T10:00:00.000Z' })
    const g2 = makeGleam({ id: 'g2', createdAt: '2026-07-15T10:00:00.000Z' })
    repo = createMockRepo([g1, g2])
    serverClient = createMockServerClient({
      getTimeline: mock(() => Promise.reject(new Error('Server down'))),
    })
    sync = new SyncService(repo, serverClient)

    const result = await sync.getTimeline()
    expect(result.source).toBe('local')
    expect(result.items).toHaveLength(2)
    // Should be sorted by createdAt descending
    expect(result.items[0].gleam.id).toBe('g2')
    expect(result.items[1].gleam.id).toBe('g1')
    // Default intelligence should be applied
    expect(result.items[0].intelligence.summary).toBeNull()
    expect(result.items[0].intelligence.aiTags).toEqual([])
    expect(sync.getState().status).toBe('disconnected')
  })

  // ── search (with fallback) ──

  test('search returns remote results on success', async () => {
    const g1 = makeGleam({ id: 'g1' })
    serverClient = createMockServerClient({
      search: mock(() =>
        Promise.resolve<SearchResult>({
          total: 1,
          items: [
            {
              item: { gleam: g1, intelligence: makeIntelligence() },
              score: 1,
              highlight: '**match**',
            },
          ],
        }),
      ),
    })
    sync = new SyncService(repo, serverClient)

    const result = await sync.search('match')
    expect(result.source).toBe('remote')
    expect(result.total).toBe(1)
    expect(result.items[0].item.gleam.id).toBe('g1')
    expect(result.items[0].highlight).toBe('**match**')
  })

  test('search falls back to local on server failure, wrapping with default intelligence', async () => {
    const g1 = makeGleam({ id: 'g1', thought: 'React is great' })
    const g2 = makeGleam({ id: 'g2', thought: 'Vue is also great' })
    repo = createMockRepo([g1, g2])
    serverClient = createMockServerClient({
      search: mock(() => Promise.reject(new Error('Server down'))),
    })
    sync = new SyncService(repo, serverClient)

    const result = await sync.search('React')
    expect(result.source).toBe('local')
    expect(result.total).toBe(1)
    expect(result.items[0].item.gleam.id).toBe('g1')
    expect(result.items[0].item.intelligence.summary).toBeNull()
    expect(result.items[0].highlight).toBeNull() // local search has no highlights
  })

  // ── updateDerivedFields (local-first) ──

  test('updateDerivedFields updates locally first, then syncs', async () => {
    const g1 = makeGleam({ id: 'g1', tags: ['old'] })
    repo = createMockRepo([g1])
    const updateMock = mock(() => Promise.resolve(true))
    serverClient = createMockServerClient({ updateDerivedFields: updateMock })
    sync = new SyncService(repo, serverClient)

    await sync.updateDerivedFields('g1', { tags: ['new'] })

    // Local should be updated immediately
    const local = await repo.getById('g1')
    expect(local?.tags).toEqual(['new'])
    // Server should also be called
    expect(updateMock).toHaveBeenCalledWith('g1', { tags: ['new'] })
  })

  test('updateDerivedFields succeeds locally even if server fails', async () => {
    const g1 = makeGleam({ id: 'g1', tags: ['old'] })
    repo = createMockRepo([g1])
    serverClient = createMockServerClient({
      updateDerivedFields: mock(() => Promise.reject(new Error('Server down'))),
    })
    sync = new SyncService(repo, serverClient)

    // Should NOT throw — server failure is swallowed
    await sync.updateDerivedFields('g1', { tags: ['new'] })

    const local = await repo.getById('g1')
    expect(local?.tags).toEqual(['new'])
  })

  // ── renameTag (local-first) ──

  test('renameTag updates locally and syncs', async () => {
    const g1 = makeGleam({ id: 'g1', tags: ['old-tag', 'other'] })
    repo = createMockRepo([g1])
    const renameMock = mock(() => Promise.resolve(1))
    serverClient = createMockServerClient({ renameTag: renameMock })
    sync = new SyncService(repo, serverClient)

    await sync.renameTag('old-tag', 'new-tag')

    const local = await repo.getById('g1')
    expect(local?.tags).toContain('new-tag')
    expect(local?.tags).not.toContain('old-tag')
    expect(renameMock).toHaveBeenCalledWith('old-tag', 'new-tag')
  })

  // ── removeTag (local-first with best-effort server sync) ──

  test('removeTag updates locally first, then calls server removeTag', async () => {
    const g1 = makeGleam({ id: 'g1', tags: ['react', 'hooks'] })
    repo = createMockRepo([g1])
    const removeTagMock = mock(() => Promise.resolve(true))
    serverClient = createMockServerClient({ removeTag: removeTagMock })
    sync = new SyncService(repo, serverClient)

    await sync.removeTag('g1', 'react')

    // Local should be updated immediately (react removed)
    const local = await repo.getById('g1')
    expect(local?.tags).toEqual(['hooks'])
    // Server should also be called
    expect(removeTagMock).toHaveBeenCalledWith('g1', 'react')
  })

  test('removeTag persists local change on server failure', async () => {
    const g1 = makeGleam({ id: 'g1', tags: ['react', 'hooks'] })
    repo = createMockRepo([g1])
    serverClient = createMockServerClient({
      removeTag: mock(() => Promise.reject(new Error('Server down'))),
    })
    sync = new SyncService(repo, serverClient)

    // Should NOT throw — server failure is swallowed
    await sync.removeTag('g1', 'react')

    // Local change should still persist
    const local = await repo.getById('g1')
    expect(local?.tags).toEqual(['hooks'])
  })

  // ── getGleamRelations ──

  test('getGleamRelations returns parsed relations on success', async () => {
    const rel = makeRelation()
    serverClient = createMockServerClient({
      getGleamRelations: mock(() => Promise.resolve<GleamRelation[]>([rel])),
    })
    sync = new SyncService(repo, serverClient)

    const relations = await sync.getGleamRelations('g1')
    expect(relations).toHaveLength(1)
    expect(relations[0].id).toBe('rel-001')
    expect(relations[0].targetGleam.id).toBe('g2')
  })

  test('getGleamRelations returns [] on server error', async () => {
    serverClient = createMockServerClient({
      getGleamRelations: mock(() => Promise.reject(new Error('Server down'))),
    })
    sync = new SyncService(repo, serverClient)

    const relations = await sync.getGleamRelations('g1')
    expect(relations).toEqual([])
  })

  // ── Intelligence config methods ──

  test('getIntelligenceConfig returns config on success', async () => {
    const config: IntelligenceConfigView = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      hasApiKey: true,
    }
    serverClient = createMockServerClient({
      getIntelligenceConfig: mock(() => Promise.resolve<IntelligenceConfigView | null>(config)),
    })
    sync = new SyncService(repo, serverClient)

    const result = await sync.getIntelligenceConfig()
    expect(result).not.toBeNull()
    expect(result!.provider).toBe('openai')
  })

  test('getIntelligenceConfig returns null on server error', async () => {
    serverClient = createMockServerClient({
      getIntelligenceConfig: mock(() => Promise.reject(new Error('Server down'))),
    })
    sync = new SyncService(repo, serverClient)

    const result = await sync.getIntelligenceConfig()
    expect(result).toBeNull()
  })

  // ── onGleamCaptured ──

  test('onGleamCaptured increments pending count and triggers sync', async () => {
    const g1 = makeGleam({ id: 'g1' })
    repo = createMockRepo([g1])
    const appendMock = mock(() =>
      Promise.resolve<AppendResult>({ accepted: 1, skipped: 0, rejected: 0, errors: [] }),
    )
    serverClient = createMockServerClient({ appendGleams: appendMock })
    sync = new SyncService(repo, serverClient)

    await sync.onGleamCaptured()
    // Wait for async syncPending to complete
    await new Promise((r) => setTimeout(r, 50))

    expect(sync.getState().pendingCount).toBe(0) // synced successfully
    expect(appendMock).toHaveBeenCalledTimes(1)
  })

  test('onGleamCaptured keeps gleam local if sync fails', async () => {
    const g1 = makeGleam({ id: 'g1' })
    repo = createMockRepo([g1])
    serverClient = createMockServerClient({
      appendGleams: mock(() => Promise.reject(new Error('Network error'))),
    })
    sync = new SyncService(repo, serverClient)

    await sync.onGleamCaptured()
    await new Promise((r) => setTimeout(r, 50))

    expect(sync.getState().pendingCount).toBe(1) // still pending
    expect(sync.getState().status).toBe('disconnected')
  })
})

// Type import for SyncState (used in test type annotations)
import type { SyncState } from '../services/sync'
