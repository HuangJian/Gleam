import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { initDatabase } from '../database/index'
import { SqliteRepository } from '../repository/sqlite-repository'
import type { DB } from '../database'
import type { Database } from 'bun:sqlite'
import { existsSync, rmSync } from 'node:fs'
import type { Gleam } from '../domain/gleam'

const TEST_DB = './data/test-gleam.sqlite'

let db: DB
let sqlite: Database
let repo: SqliteRepository

function makeGleam(overrides: Partial<Gleam> = {}): Gleam {
  return {
    id: '01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    thought: 'A flash of understanding.',
    source: {
      type: 'url',
      url: 'https://example.com/article',
      title: 'Example Article',
      excerpt: 'An excerpt from the article.',
    },
    createdAt: '2026-07-14T10:00:00.000Z',
    tags: ['insight'],
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
})

afterEach(() => {
  sqlite.close()
  if (existsSync(TEST_DB)) rmSync(TEST_DB, { force: true })
  if (existsSync(`${TEST_DB}-wal`)) rmSync(`${TEST_DB}-wal`, { force: true })
  if (existsSync(`${TEST_DB}-shm`)) rmSync(`${TEST_DB}-shm`, { force: true })
})

// ── appendGleams ────────────────────────────────────────

describe('SqliteRepository.appendGleams', () => {
  test('inserts a new gleam and returns accepted=1', async () => {
    const gleam = makeGleam()
    const result = await repo.appendGleams([gleam])
    expect(result.accepted).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.rejected).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  test('skips duplicate id (idempotent core)', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])
    const result = await repo.appendGleams([gleam])
    expect(result.accepted).toBe(0)
    expect(result.skipped).toBe(1)
  })

  test('rejects invalid UUID v7', async () => {
    const gleam = makeGleam({ id: 'not-a-uuid' })
    const result = await repo.appendGleams([gleam])
    expect(result.rejected).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('Invalid UUID v7')
  })

  test('rejects batch exceeding max size', async () => {
    const gleams = Array.from({ length: 101 }, (_, i) =>
      makeGleam({ id: `01978a3e-${String(i).padStart(4, '0')}-7c3d-8e4f-5a6b7c8d9e0f` }),
    )
    await expect(repo.appendGleams(gleams)).rejects.toThrow('Batch size exceeds maximum')
  })

  test('upserts derived data on duplicate id', async () => {
    const gleam = makeGleam({ tags: ['original'] })
    await repo.appendGleams([gleam])

    // Re-append with updated tags
    const updated = makeGleam({ tags: ['updated', 'new'] })
    await repo.appendGleams([updated])

    const fetched = await repo.getGleamById(gleam.id)
    expect(fetched?.tags).toEqual(['updated', 'new'])
  })
})

// ── updateGleamDerivedFields ────────────────────────────

describe('SqliteRepository.updateGleamDerivedFields', () => {
  test('updates tags on existing gleam', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])

    const result = await repo.updateGleamDerivedFields(gleam.id, { tags: ['new-tag'] })
    expect(result.success).toBe(true)

    const fetched = await repo.getGleamById(gleam.id)
    expect(fetched?.tags).toEqual(['new-tag'])
  })

  test('updates revisitCount and lastRevisitedAt', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])

    await repo.updateGleamDerivedFields(gleam.id, {
      revisitCount: 3,
      lastRevisitedAt: '2026-07-15T12:00:00.000Z',
    })

    const fetched = await repo.getGleamById(gleam.id)
    expect(fetched?.revisitCount).toBe(3)
    expect(fetched?.lastRevisitedAt).toBe('2026-07-15T12:00:00.000Z')
  })

  test('returns success=false for non-existent gleam', async () => {
    const result = await repo.updateGleamDerivedFields('01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f', {
      tags: ['test'],
    })
    expect(result.success).toBe(false)
  })
})

// ── renameTag ───────────────────────────────────────────

describe('SqliteRepository.renameTag', () => {
  test('renames tag across all gleams', async () => {
    const g1 = makeGleam({ id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f', tags: ['react', 'hooks'] })
    const g2 = makeGleam({ id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f', tags: ['react'] })
    await repo.appendGleams([g1, g2])

    const result = await repo.renameTag('react', 'reactjs')
    expect(result.affectedCount).toBe(2)

    const fetched1 = await repo.getGleamById(g1.id)
    const fetched2 = await repo.getGleamById(g2.id)
    expect(fetched1?.tags).toContain('reactjs')
    expect(fetched1?.tags).not.toContain('react')
    expect(fetched2?.tags).toEqual(['reactjs'])
  })

  test('returns 0 when old tag does not exist', async () => {
    const result = await repo.renameTag('nonexistent', 'new')
    expect(result.affectedCount).toBe(0)
  })

  test('returns 0 when old and new are the same', async () => {
    const result = await repo.renameTag('same', 'same')
    expect(result.affectedCount).toBe(0)
  })
})

// ── getTimeline ─────────────────────────────────────────

describe('SqliteRepository.getTimeline', () => {
  test('returns gleams sorted by createdAt descending', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      createdAt: '2026-07-01T10:00:00.000Z',
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      createdAt: '2026-07-15T10:00:00.000Z',
    })
    const g3 = makeGleam({
      id: '01978a3e-0003-7c3d-8e4f-5a6b7c8d9e0f',
      createdAt: '2026-07-10T10:00:00.000Z',
    })
    await repo.appendGleams([g1, g2, g3])

    const result = await repo.getTimeline({ limit: 10 })
    expect(result.items.map((g) => g.id)).toEqual([g2.id, g3.id, g1.id])
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(false)
  })

  test('paginates with limit and offset', async () => {
    const gleams = Array.from({ length: 5 }, (_, i) =>
      makeGleam({
        id: `01978a3e-${String(i + 1).padStart(4, '0')}-7c3d-8e4f-5a6b7c8d9e0f`,
        createdAt: `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      }),
    )
    await repo.appendGleams(gleams)

    const page1 = await repo.getTimeline({ limit: 2, offset: 0 })
    const page2 = await repo.getTimeline({ limit: 2, offset: 2 })
    const page3 = await repo.getTimeline({ limit: 2, offset: 4 })

    expect(page1.items).toHaveLength(2)
    expect(page1.hasMore).toBe(true)
    expect(page2.items).toHaveLength(2)
    expect(page2.hasMore).toBe(true)
    expect(page3.items).toHaveLength(1)
    expect(page3.hasMore).toBe(false)
  })

  test('filters by date range', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      createdAt: '2026-07-01T10:00:00.000Z',
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      createdAt: '2026-07-15T10:00:00.000Z',
    })
    await repo.appendGleams([g1, g2])

    const result = await repo.getTimeline({
      from: '2026-07-10T00:00:00.000Z',
      to: '2026-07-20T00:00:00.000Z',
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe(g2.id)
  })
})

// ── search ──────────────────────────────────────────────

describe('SqliteRepository.search', () => {
  test('finds gleams by thought content', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'React hooks are powerful',
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'Vue is also nice',
    })
    await repo.appendGleams([g1, g2])

    const result = await repo.search('React')
    expect(result.total).toBe(1)
    expect(result.items[0].gleam.id).toBe(g1.id)
  })

  test('finds gleams by tag', async () => {
    const g1 = makeGleam({ id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f', tags: ['typescript'] })
    const g2 = makeGleam({ id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f', tags: ['javascript'] })
    await repo.appendGleams([g1, g2])

    const result = await repo.search('typescript')
    expect(result.total).toBe(1)
    expect(result.items[0].gleam.id).toBe(g1.id)
  })

  test('returns empty for no matches', async () => {
    const g1 = makeGleam()
    await repo.appendGleams([g1])

    const result = await repo.search('nonexistentterm')
    expect(result.total).toBe(0)
    expect(result.items).toHaveLength(0)
  })

  test('returns empty for empty query', async () => {
    const result = await repo.search('')
    expect(result.total).toBe(0)
  })

  test('includes highlight in search results', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'Machine learning is statistics with marketing',
    })
    await repo.appendGleams([g1])

    const result = await repo.search('machine')
    expect(result.items[0].highlight).toBeTruthy()
    expect(result.items[0].highlight).toContain('**')
  })

  // ── Rich query language (shared/query.ts) ────────────

  test('does NOT throw on malformed query (bare "#") — falls back to free-text', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'A thought about react',
    })
    await repo.appendGleams([g1])

    // A bare "#" with no value is a QueryParseError. The backend must not
    // surface it as a GraphQLError — it should fall back to free-text like
    // the client's runQuery does.
    await expect(repo.search('#')).resolves.toBeDefined()
    const result = await repo.search('#')
    expect(Array.isArray(result.items)).toBe(true)
  })

  test('finds gleams by #tag syntax', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      tags: ['react', 'frontend'],
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      tags: ['vue'],
    })
    await repo.appendGleams([g1, g2])

    const result = await repo.search('#react')
    expect(result.total).toBe(1)
    expect(result.items[0].gleam.id).toBe(g1.id)
  })

  test('finds gleams by domain: syntax', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      source: { type: 'url', url: 'https://github.com/foo/bar', title: '', excerpt: '' },
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      source: { type: 'url', url: 'https://example.com/page', title: '', excerpt: '' },
    })
    await repo.appendGleams([g1, g2])

    const result = await repo.search('domain:github.com')
    expect(result.total).toBe(1)
    expect(result.items[0].gleam.id).toBe(g1.id)
  })

  test('finds gleams by type: syntax', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      source: { type: 'book', url: '', title: 'Deep Work', excerpt: '' },
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      source: { type: 'url', url: 'https://x.com', title: '', excerpt: '' },
    })
    await repo.appendGleams([g1, g2])

    const result = await repo.search('type:book')
    expect(result.total).toBe(1)
    expect(result.items[0].gleam.id).toBe(g1.id)
  })

  test('finds gleams by date range with >= and <=', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      createdAt: '2026-03-10T09:00:00.000Z',
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      createdAt: '2026-06-15T09:00:00.000Z',
    })
    const g3 = makeGleam({
      id: '01978a3e-0003-7c3d-8e4f-5a6b7c8d9e0f',
      createdAt: '2026-08-20T09:00:00.000Z',
    })
    await repo.appendGleams([g1, g2, g3])

    // Both March (g1) and June (g2) fall within Jan 1 - Jun 30; August (g3) is outside.
    const result = await repo.search('>=20260101 <=20260630')
    expect(result.total).toBe(2)
    const ids = result.items.map((h) => h.gleam.id)
    expect(ids).toContain(g1.id)
    expect(ids).toContain(g2.id)
  })

  test('supports OR boolean logic', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'React is great',
      tags: [],
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'Vue is great',
      tags: [],
    })
    const g3 = makeGleam({
      id: '01978a3e-0003-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'Angular is great',
      tags: [],
    })
    await repo.appendGleams([g1, g2, g3])

    const result = await repo.search('React OR Vue')
    expect(result.total).toBe(2)
    const ids = result.items.map((h) => h.gleam.id)
    expect(ids).toContain(g1.id)
    expect(ids).toContain(g2.id)
    expect(ids).not.toContain(g3.id)
  })

  test('supports NOT to exclude terms', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'React hooks',
    })
    const g2 = makeGleam({
      id: '01978a3e-0002-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'Vue composition',
    })
    await repo.appendGleams([g1, g2])

    const result = await repo.search('NOT React')
    expect(result.total).toBe(1)
    expect(result.items[0].gleam.id).toBe(g2.id)
  })

  test('bugfix: plain keyword matching only a tag yields no highlight (shows thought)', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'A thought about programming, not about the tag word',
      tags: ['react'],
    })
    await repo.appendGleams([g1])

    // "react" is a plain keyword that matches the tag but NOT the thought.
    // The card should fall back to rendering the thought, so the highlight
    // must be null (not a snippet containing only the tag name).
    const result = await repo.search('react')
    expect(result.total).toBe(1)
    expect(result.items[0].highlight).toBeNull()
  })

  test('does NOT highlight filter values (tag, domain)', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'Some thought about programming',
      tags: ['react'],
    })
    await repo.appendGleams([g1])

    // #react is a tag filter — should match but not produce a highlight
    const result = await repo.search('#react')
    expect(result.total).toBe(1)
    expect(result.items[0].highlight).toBeNull()
  })

  test('highlights keyword terms but not filter values in mixed queries', async () => {
    const g1 = makeGleam({
      id: '01978a3e-0001-7c3d-8e4f-5a6b7c8d9e0f',
      thought: 'Learning about React hooks patterns',
      tags: ['frontend'],
    })
    await repo.appendGleams([g1])

    // #frontend is a filter (no highlight), "hooks" is a keyword (highlighted)
    const result = await repo.search('#frontend hooks')
    expect(result.total).toBe(1)
    expect(result.items[0].highlight).toBeTruthy()
    expect(result.items[0].highlight).toContain('**hooks**')
    // Should not highlight "frontend"
    expect(result.items[0].highlight).not.toContain('**frontend**')
  })
})

// ── getGleamById ────────────────────────────────────────

describe('SqliteRepository.getGleamById', () => {
  test('returns the gleam when found', async () => {
    const gleam = makeGleam()
    await repo.appendGleams([gleam])

    const fetched = await repo.getGleamById(gleam.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.id).toBe(gleam.id)
    expect(fetched?.thought).toBe(gleam.thought)
    expect(fetched?.tags).toEqual(gleam.tags)
  })

  test('returns null when not found', async () => {
    const fetched = await repo.getGleamById('01978a3e-9999-7c3d-8e4f-5a6b7c8d9e0f')
    expect(fetched).toBeNull()
  })
})
