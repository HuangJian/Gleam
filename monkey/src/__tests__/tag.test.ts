import { describe, test, expect } from 'bun:test'
import { countTags } from '../services/tag'
import { makeGleamWithIntelligence } from './helpers'

describe('countTags', () => {
  test('returns empty list when no gleams have tags', () => {
    expect(countTags([makeGleamWithIntelligence(), makeGleamWithIntelligence()])).toEqual([])
  })

  test('counts each tag by number of gleams using it', () => {
    const items = [
      makeGleamWithIntelligence({ id: 'a', tags: ['react', 'hooks'] }),
      makeGleamWithIntelligence({ id: 'b', tags: ['react'] }),
      makeGleamWithIntelligence({ id: 'c', tags: ['hooks', 'react'] }),
    ]
    const counts = countTags(items)
    expect(counts).toEqual([
      { tag: 'react', count: 3 },
      { tag: 'hooks', count: 2 },
    ])
  })

  test('sorts ties alphabetically', () => {
    const items = [
      makeGleamWithIntelligence({ id: 'a', tags: ['zebra'] }),
      makeGleamWithIntelligence({ id: 'b', tags: ['apple'] }),
    ]
    const counts = countTags(items)
    expect(counts.map((c) => c.tag)).toEqual(['apple', 'zebra'])
  })

  test('handles empty gleam list', () => {
    expect(countTags([])).toEqual([])
  })

  test('handles gleams with empty tags arrays', () => {
    const items = [
      makeGleamWithIntelligence({ id: 'a', tags: [] }),
      makeGleamWithIntelligence({ id: 'b', tags: [] }),
    ]
    expect(countTags(items)).toEqual([])
  })

  test('counts each tag occurrence (duplicates prevented at app layer)', () => {
    // In practice, tags are deduplicated by handleAddTag (uses Set), so a gleam
    // never has duplicate tags. countTags itself does not deduplicate — it
    // counts each entry as-is.
    const items = [makeGleamWithIntelligence({ id: 'a', tags: ['react', 'react'] })]
    const counts = countTags(items)
    expect(counts).toEqual([{ tag: 'react', count: 2 }])
  })
})
