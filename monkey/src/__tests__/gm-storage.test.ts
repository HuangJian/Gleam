import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { GMStorageAdapter } from '../infra/gm-storage'
import type { Gleam } from '../domain/gleam'

// ── In-memory GM storage mock ─────────────────────────
//
// Simulates Tampermonkey's GM_setValue/GM_getValue/GM_deleteValue/GM_listValues
// with a simple Map. This is the same model Tampermonkey uses internally:
// synchronous, in-process, shared across all "tabs" (in tests, across all
// adapter instances that share the same mock).

const store = new Map<string, unknown>()

function resetStore() {
  store.clear()
}

beforeEach(() => {
  resetStore()
  ;(globalThis as unknown as Record<string, unknown>).GM_getValue = <T>(
    key: string,
    defaultValue?: T,
  ): T => {
    return (store.get(key) as T) ?? (defaultValue as T)
  }
  ;(globalThis as unknown as Record<string, unknown>).GM_setValue = (
    key: string,
    value: unknown,
  ): void => {
    store.set(key, value)
  }
  ;(globalThis as unknown as Record<string, unknown>).GM_deleteValue = (key: string): void => {
    store.delete(key)
  }
  ;(globalThis as unknown as Record<string, unknown>).GM_listValues = (): string[] => {
    return Array.from(store.keys())
  }
})

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).GM_getValue
  delete (globalThis as unknown as Record<string, unknown>).GM_setValue
  delete (globalThis as unknown as Record<string, unknown>).GM_deleteValue
  delete (globalThis as unknown as Record<string, unknown>).GM_listValues
})

function makeGleam(overrides: Partial<Gleam> = {}): Gleam {
  return {
    id: '01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    thought: 'A flash of understanding.',
    source: {
      type: 'url',
      url: 'https://example.com/article',
      title: 'Example Article',
      excerpt: '',
    },
    createdAt: '2026-07-14T10:00:00.000Z',
    tags: [],
    revisitCount: 0,
    lastRevisitedAt: '',
    ...overrides,
  }
}

// ── Basic CRUD tests ──────────────────────────────────

describe('GMStorageAdapter — basic CRUD', () => {
  test('save and getById', async () => {
    const repo = new GMStorageAdapter()
    const gleam = makeGleam({ id: 'g1', thought: 'Hello' })
    await repo.save(gleam)
    const fetched = await repo.getById('g1')
    expect(fetched).not.toBeNull()
    expect(fetched?.thought).toBe('Hello')
  })

  test('save throws on duplicate id (immutability)', async () => {
    const repo = new GMStorageAdapter()
    await repo.save(makeGleam({ id: 'g1' }))
    await expect(repo.save(makeGleam({ id: 'g1' }))).rejects.toThrow('already exists')
  })

  test('getById returns null for non-existent id', async () => {
    const repo = new GMStorageAdapter()
    expect(await repo.getById('nonexistent')).toBeNull()
  })

  test('getAll returns all gleams sorted by createdAt desc', async () => {
    const repo = new GMStorageAdapter()
    await repo.save(makeGleam({ id: 'g1', createdAt: '2026-07-01T10:00:00.000Z' }))
    await repo.save(makeGleam({ id: 'g2', createdAt: '2026-07-15T10:00:00.000Z' }))
    await repo.save(makeGleam({ id: 'g3', createdAt: '2026-07-10T10:00:00.000Z' }))

    const all = await repo.getAll()
    expect(all.map((g) => g.id)).toEqual(['g2', 'g3', 'g1'])
  })

  test('getAll returns empty array when no gleams', async () => {
    const repo = new GMStorageAdapter()
    expect(await repo.getAll()).toEqual([])
  })

  test('updateDerivedFields updates tags', async () => {
    const repo = new GMStorageAdapter()
    await repo.save(makeGleam({ id: 'g1', tags: ['old'] }))
    await repo.updateDerivedFields('g1', { tags: ['new'] })
    const fetched = await repo.getById('g1')
    expect(fetched?.tags).toEqual(['new'])
  })

  test('updateDerivedFields updates revisitCount and lastRevisitedAt', async () => {
    const repo = new GMStorageAdapter()
    await repo.save(makeGleam({ id: 'g1' }))
    await repo.updateDerivedFields('g1', {
      revisitCount: 5,
      lastRevisitedAt: '2026-07-20T12:00:00.000Z',
    })
    const fetched = await repo.getById('g1')
    expect(fetched?.revisitCount).toBe(5)
    expect(fetched?.lastRevisitedAt).toBe('2026-07-20T12:00:00.000Z')
  })

  test('updateDerivedFields is a no-op (does not throw) when the local gleam key is absent', async () => {
    // After a gleam is synced, its local `gleam:<id>` key is cleared
    // (thin-cache model). A derived-field update must not throw in that case —
    // the server is the source of truth and still receives the mutation.
    // Regression: previously threw "not found", causing tag edits on synced
    // gleams to fail silently (input cleared, tag not added).
    const repo = new GMStorageAdapter()
    await expect(repo.updateDerivedFields('nonexistent', { tags: ['x'] })).resolves.toBeUndefined()
  })

  test('renameTag renames across all gleams', async () => {
    const repo = new GMStorageAdapter()
    await repo.save(makeGleam({ id: 'g1', tags: ['react', 'hooks'] }))
    await repo.save(makeGleam({ id: 'g2', tags: ['react'] }))
    await repo.save(makeGleam({ id: 'g3', tags: ['vue'] }))

    await repo.renameTag('react', 'reactjs')

    expect((await repo.getById('g1'))?.tags).toEqual(['hooks', 'reactjs'])
    expect((await repo.getById('g2'))?.tags).toEqual(['reactjs'])
    expect((await repo.getById('g3'))?.tags).toEqual(['vue'])
  })

  test('renameTag is a no-op when old === new', async () => {
    const repo = new GMStorageAdapter()
    await repo.save(makeGleam({ id: 'g1', tags: ['react'] }))
    await repo.renameTag('react', 'react')
    expect((await repo.getById('g1'))?.tags).toEqual(['react'])
  })

  test('clearSynced removes gleams by id', async () => {
    const repo = new GMStorageAdapter()
    await repo.save(makeGleam({ id: 'g1' }))
    await repo.save(makeGleam({ id: 'g2' }))
    await repo.save(makeGleam({ id: 'g3' }))

    await repo.clearSynced(['g1', 'g3'])

    expect(await repo.getById('g1')).toBeNull()
    expect(await repo.getById('g2')).not.toBeNull()
    expect(await repo.getById('g3')).toBeNull()
  })

  test('clearSynced is a no-op for empty ids', async () => {
    const repo = new GMStorageAdapter()
    await repo.save(makeGleam({ id: 'g1' }))
    await repo.clearSynced([])
    expect(await repo.getById('g1')).not.toBeNull()
  })

  test('clearSynced is a no-op for non-existent ids', async () => {
    const repo = new GMStorageAdapter()
    await repo.save(makeGleam({ id: 'g1' }))
    await repo.clearSynced(['nonexistent'])
    expect(await repo.getById('g1')).not.toBeNull()
  })
})

// ── Concurrency / race condition tests ────────────────
//
// These tests verify the KEY property of per-gleam key storage: multiple
// adapters (simulating multiple tabs) can operate concurrently without
// data loss. Each adapter shares the same underlying GM storage mock.

describe('GMStorageAdapter — concurrency safety', () => {
  test('two tabs saving different gleams simultaneously — no data loss', async () => {
    // Simulates: Tab A captures g1, Tab B captures g2 at the same time.
    // With the old single-key model, one would overwrite the other.
    // With per-gleam keys, both saves are independent atomic writes.
    const tabA = new GMStorageAdapter()
    const tabB = new GMStorageAdapter()

    // Fire both saves "simultaneously" (interleaved in the event loop).
    const [a, b] = await Promise.all([
      tabA.save(makeGleam({ id: 'g1', thought: 'From Tab A' })),
      tabB.save(makeGleam({ id: 'g2', thought: 'From Tab B' })),
    ])
    void a
    void b

    // Both gleams must survive.
    const g1 = await tabA.getById('g1')
    const g2 = await tabB.getById('g2')
    expect(g1?.thought).toBe('From Tab A')
    expect(g2?.thought).toBe('From Tab B')

    const all = await tabA.getAll()
    expect(all).toHaveLength(2)
  })

  test('clearSynced does not clobber a concurrent save', async () => {
    // Simulates the deadliest race in the old model:
    //   Tab A syncPending → clearSynced(['g1', 'g2'])
    //   Tab C captures g3 → save(g3)
    // If these interleave in the old read-modify-write model, g3 is lost.
    // With per-gleam keys, clearSynced only deletes g1 and g2's keys —
    // g3's key is never touched.
    const tabA = new GMStorageAdapter()
    const tabC = new GMStorageAdapter()

    // Seed: g1 and g2 are pending upload.
    await tabA.save(makeGleam({ id: 'g1' }))
    await tabA.save(makeGleam({ id: 'g2' }))

    // Interleave: Tab A clears g1, g2 while Tab C saves g3.
    await Promise.all([
      tabA.clearSynced(['g1', 'g2']),
      tabC.save(makeGleam({ id: 'g3', thought: 'Captured during sync' })),
    ])

    // g1 and g2 are gone (uploaded and cleared).
    expect(await tabA.getById('g1')).toBeNull()
    expect(await tabA.getById('g2')).toBeNull()
    // g3 survived — NOT clobbered by clearSynced.
    const g3 = await tabC.getById('g3')
    expect(g3?.thought).toBe('Captured during sync')
  })

  test('clearSynced on one tab does not affect gleams saved by another tab', async () => {
    const tabA = new GMStorageAdapter()
    const tabB = new GMStorageAdapter()

    await tabA.save(makeGleam({ id: 'g1' }))
    await tabA.save(makeGleam({ id: 'g2' }))
    await tabB.save(makeGleam({ id: 'g3' }))
    await tabB.save(makeGleam({ id: 'g4' }))

    // Tab A clears its synced gleams (g1, g2).
    await tabA.clearSynced(['g1', 'g2'])

    // Tab B's gleams are untouched.
    const all = await tabB.getAll()
    expect(all.map((g) => g.id).sort()).toEqual(['g3', 'g4'])
  })

  test('getAll sees gleams saved by other tabs', async () => {
    const tabA = new GMStorageAdapter()
    const tabB = new GMStorageAdapter()

    await tabA.save(makeGleam({ id: 'g1' }))
    await tabB.save(makeGleam({ id: 'g2' }))

    const all = await tabA.getAll()
    expect(all).toHaveLength(2)
  })

  test('renameTag on one tab does not clobber concurrent save on another', async () => {
    const tabA = new GMStorageAdapter()
    const tabB = new GMStorageAdapter()

    await tabA.save(makeGleam({ id: 'g1', tags: ['old-tag'] }))

    // Tab A renames while Tab B captures a new gleam.
    await Promise.all([
      tabA.renameTag('old-tag', 'new-tag'),
      tabB.save(makeGleam({ id: 'g2', tags: ['old-tag'] })),
    ])

    // g1 should have the renamed tag.
    const g1 = await tabA.getById('g1')
    expect(g1?.tags).toContain('new-tag')
    expect(g1?.tags).not.toContain('old-tag')

    // g2 should survive (not clobbered by renameTag's enumeration).
    const g2 = await tabB.getById('g2')
    expect(g2).not.toBeNull()
    // g2 was saved after renameTag's snapshot, so it keeps 'old-tag'.
    // This is acceptable — the user can re-run renameTag.
    expect(g2?.tags).toContain('old-tag')
  })

  test('multiple clearSynced calls are idempotent', async () => {
    const tabA = new GMStorageAdapter()
    const tabB = new GMStorageAdapter()

    await tabA.save(makeGleam({ id: 'g1' }))
    await tabA.save(makeGleam({ id: 'g2' }))

    // Both tabs try to clear the same ids (simulating both syncs succeeding).
    await Promise.all([tabA.clearSynced(['g1', 'g2']), tabB.clearSynced(['g1', 'g2'])])

    expect(await tabA.getById('g1')).toBeNull()
    expect(await tabA.getById('g2')).toBeNull()
    expect(await tabA.getAll()).toEqual([])
  })
})
