import { describe, test, expect } from 'bun:test'
import { parseQuery, runQuery, extractKeywords } from '@shared/query'
import type { Gleam } from '@shared/types'

function makeGleam(overrides: Partial<Gleam> = {}): Gleam {
  return {
    id: 'g1',
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

const FIXTURES: Gleam[] = [
  makeGleam({
    id: 'a',
    thought: 'React hooks changed how I think about state.',
    source: {
      type: 'url',
      url: 'https://github.com/facebook/react',
      title: 'React repo',
      excerpt: '',
    },
    tags: ['react', 'frontend'],
    createdAt: '2026-03-10T09:00:00.000Z',
  }),
  makeGleam({
    id: 'b',
    thought: 'A book about deep work and focus.',
    source: { type: 'book', url: '', title: 'Deep Work', excerpt: '' },
    tags: ['productivity'],
    createdAt: '2026-05-20T09:00:00.000Z',
  }),
  makeGleam({
    id: 'c',
    thought: 'Machine learning is just statistics with marketing.',
    source: { type: 'url', url: 'https://arxiv.org/abs/1234', title: 'Paper', excerpt: '' },
    tags: ['ml', 'ai'],
    createdAt: '2026-07-01T09:00:00.000Z',
  }),
]

// ── extractKeywords ───────────────────────────────────

describe('extractKeywords', () => {
  test('returns empty array for null AST', () => {
    expect(extractKeywords(null)).toEqual([])
  })

  test('extracts bare keywords', () => {
    const ast = parseQuery('react hooks')
    expect(extractKeywords(ast)).toEqual(['react', 'hooks'])
  })

  test('extracts keywords from OR expression', () => {
    const ast = parseQuery('machine learning OR deep learning')
    // "machine" and "learning" are separate bare words (space-separated),
    // not a single phrase. Use quotes for a phrase: ""machine learning"".
    expect(extractKeywords(ast)).toEqual(['machine', 'learning', 'deep', 'learning'])
  })

  test('does NOT extract filter values (tag, domain, type)', () => {
    const ast = parseQuery('#frontend domain:github.com type:book react')
    expect(extractKeywords(ast)).toEqual(['react'])
  })

  test('does NOT extract date operators or periods', () => {
    const ast = parseQuery('>=20260101 ~2026 react')
    expect(extractKeywords(ast)).toEqual(['react'])
  })

  test('does NOT extract keywords from negated subtrees', () => {
    const ast = parseQuery('react NOT vue')
    expect(extractKeywords(ast)).toEqual(['react'])
  })

  test('extracts from parenthesized groups', () => {
    const ast = parseQuery('(react OR vue) hooks')
    expect(extractKeywords(ast)).toEqual(['react', 'vue', 'hooks'])
  })

  test('handles empty keyword values gracefully', () => {
    const ast = parseQuery('""')
    expect(extractKeywords(ast)).toEqual([])
  })
})

// ── Basic query evaluation (smoke test for backend import) ──

describe('runQuery (backend import smoke test)', () => {
  test('returns all gleams for empty query', () => {
    expect(runQuery('', FIXTURES)).toHaveLength(3)
  })

  test('filters by keyword', () => {
    expect(runQuery('React', FIXTURES)).toHaveLength(1)
    expect(runQuery('React', FIXTURES)[0].id).toBe('a')
  })

  test('filters by tag', () => {
    expect(runQuery('#ml', FIXTURES)).toHaveLength(1)
    expect(runQuery('#ml', FIXTURES)[0].id).toBe('c')
  })

  test('filters by domain', () => {
    expect(runQuery('domain:github.com', FIXTURES)).toHaveLength(1)
    expect(runQuery('domain:github.com', FIXTURES)[0].id).toBe('a')
  })

  test('filters by boolean OR', () => {
    const result = runQuery('React OR Machine', FIXTURES)
    expect(result).toHaveLength(2)
    const ids = result.map((g) => g.id)
    expect(ids).toContain('a')
    expect(ids).toContain('c')
  })

  test('falls back to free-text on parse error without throwing', () => {
    // Unbalanced parens → QueryParseError → falls back to keyword match.
    // The raw input "(react" won't match any fixture text, but the important
    // behavior is that runQuery does not throw.
    expect(() => runQuery('(React', FIXTURES)).not.toThrow()
    const result = runQuery('(React', FIXTURES)
    expect(Array.isArray(result)).toBe(true)
  })
})
