import { describe, test, expect } from 'bun:test'
import { TagService } from '../services/tag'
import { Gleam } from '../domain/gleam'

function makeGleam(overrides: Partial<Gleam> = {}): Gleam {
  return {
    id: 'g1',
    thought: 't',
    source: { type: 'thought' },
    created_at: '2026-07-14T10:00:00.000Z',
    tags: [],
    ...overrides,
  }
}

function mockRepo(gleams: Gleam[]) {
  return {
    getAll: async () => gleams,
    getById: async (id: string) => gleams.find((g) => g.id === id) ?? null,
    save: async () => {},
    delete: async () => {},
    search: async () => gleams,
    updateDerivedFields: async () => {},
    renameTag: async () => {},
  }
}

describe('TagService', () => {
  test('returns empty list when no gleams have tags', async () => {
    const svc = new TagService(mockRepo([makeGleam(), makeGleam()]))
    expect(await svc.getAllTagCounts()).toEqual([])
  })

  test('counts each tag by number of gleams using it', async () => {
    const svc = new TagService(
      mockRepo([
        makeGleam({ id: 'a', tags: ['react', 'hooks'] }),
        makeGleam({ id: 'b', tags: ['react'] }),
        makeGleam({ id: 'c', tags: ['hooks', 'react'] }),
      ]),
    )
    const counts = await svc.getAllTagCounts()
    expect(counts).toEqual([
      { tag: 'react', count: 3 },
      { tag: 'hooks', count: 2 },
    ])
  })

  test('sorts ties alphabetically', async () => {
    const svc = new TagService(
      mockRepo([makeGleam({ id: 'a', tags: ['zebra'] }), makeGleam({ id: 'b', tags: ['apple'] })]),
    )
    const counts = await svc.getAllTagCounts()
    expect(counts.map((c) => c.tag)).toEqual(['apple', 'zebra'])
  })
})
