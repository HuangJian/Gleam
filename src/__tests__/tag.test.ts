import { describe, test, expect } from 'bun:test'
import { countTags } from '../services/tag'
import { Gleam } from '../domain/gleam'

function makeGleam(overrides: Partial<Gleam> = {}): Gleam {
  return {
    id: 'g1',
    thought: 't',
    source: { type: 'thought', url: '', title: '', excerpt: '' },
    createdAt: '2026-07-14T10:00:00.000Z',
    tags: [],
    revisitCount: 0,
    lastRevisitedAt: '',
    ...overrides,
  }
}

describe('countTags', () => {
  test('returns empty list when no gleams have tags', () => {
    expect(countTags([makeGleam(), makeGleam()])).toEqual([])
  })

  test('counts each tag by number of gleams using it', () => {
    const gleams = [
      makeGleam({ id: 'a', tags: ['react', 'hooks'] }),
      makeGleam({ id: 'b', tags: ['react'] }),
      makeGleam({ id: 'c', tags: ['hooks', 'react'] }),
    ]
    const counts = countTags(gleams)
    expect(counts).toEqual([
      { tag: 'react', count: 3 },
      { tag: 'hooks', count: 2 },
    ])
  })

  test('sorts ties alphabetically', () => {
    const gleams = [
      makeGleam({ id: 'a', tags: ['zebra'] }),
      makeGleam({ id: 'b', tags: ['apple'] }),
    ]
    const counts = countTags(gleams)
    expect(counts.map((c) => c.tag)).toEqual(['apple', 'zebra'])
  })

  test('handles empty gleam list', () => {
    expect(countTags([])).toEqual([])
  })

  test('handles gleams with empty tags arrays', () => {
    const gleams = [makeGleam({ id: 'a', tags: [] }), makeGleam({ id: 'b', tags: [] })]
    expect(countTags(gleams)).toEqual([])
  })

  test('counts each tag occurrence (duplicates prevented at app layer)', () => {
    // In practice, tags are deduplicated by handleAddTag (uses Set), so a gleam
    // never has duplicate tags. countTags itself does not deduplicate — it
    // counts each entry as-is.
    const gleams = [makeGleam({ id: 'a', tags: ['react', 'react'] })]
    const counts = countTags(gleams)
    expect(counts).toEqual([{ tag: 'react', count: 2 }])
  })
})
