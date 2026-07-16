import { describe, test, expect } from 'bun:test'
import { Gleam } from '../domain/gleam'
import {
  parseQuery,
  evaluateQuery,
  runQuery,
  QueryService,
  QueryParseError,
} from '../services/query'

function makeGleam(overrides: Partial<Gleam> = {}): Gleam {
  return {
    id: 'g1',
    thought: 'A flash of understanding.',
    source: { type: 'url', url: 'https://example.com/article', title: 'Example Article' },
    created_at: '2026-07-14T10:00:00.000Z',
    tags: [],
    revisit_count: 0,
    ...overrides,
  }
}

const FIXTURES: Gleam[] = [
  makeGleam({
    id: 'a',
    thought: 'React hooks changed how I think about state.',
    source: { type: 'url', url: 'https://github.com/facebook/react', title: 'React repo' },
    tags: ['react', 'frontend'],
    created_at: '2026-03-10T09:00:00.000Z',
  }),
  makeGleam({
    id: 'b',
    thought: 'A book about deep work and focus.',
    source: { type: 'book', title: 'Deep Work' },
    tags: ['productivity'],
    created_at: '2026-05-20T09:00:00.000Z',
  }),
  makeGleam({
    id: 'c',
    thought: 'Machine learning is just statistics with marketing.',
    source: { type: 'url', url: 'https://arxiv.org/abs/1234', title: 'Paper' },
    tags: ['ml', 'ai'],
    created_at: '2026-07-01T09:00:00.000Z',
  }),
]

describe('parseQuery', () => {
  test('returns null for empty input', () => {
    expect(parseQuery('')).toBeNull()
    expect(parseQuery('   ')).toBeNull()
  })

  test('parses a bare keyword', () => {
    const ast = parseQuery('react')
    expect(ast).toEqual({ kind: 'keyword', value: 'react' })
  })

  test('parses a field clause', () => {
    const ast = parseQuery('tag:react')
    expect(ast).toEqual({ kind: 'term', field: 'tag', value: 'react' })
  })

  test('parses quoted field value', () => {
    const ast = parseQuery('tag:"big idea"')
    expect(ast).toEqual({ kind: 'term', field: 'tag', value: 'big idea' })
  })

  test('parses a quoted bare word', () => {
    const ast = parseQuery('"machine learning"')
    expect(ast).toEqual({ kind: 'keyword', value: 'machine learning' })
  })

  test('throws on unknown field', () => {
    expect(() => parseQuery('foo:bar')).toThrow(QueryParseError)
  })

  test('throws on unterminated quote', () => {
    expect(() => parseQuery('"oops')).toThrow(QueryParseError)
  })

  test('throws on unbalanced parens', () => {
    expect(() => parseQuery('(tag:react')).toThrow(QueryParseError)
  })

  test('throws on dangling operator', () => {
    expect(() => parseQuery('tag:react AND')).toThrow(QueryParseError)
  })

  test('throws when field has no value', () => {
    expect(() => parseQuery('tag:')).toThrow(QueryParseError)
  })
})

describe('evaluateQuery — keyword', () => {
  test('bare keyword matches thought/tags/title/excerpt (case-insensitive)', () => {
    const r = runQuery('react', FIXTURES)
    expect(r.map((g) => g.id)).toEqual(['a'])
  })

  test('keyword matches a tag', () => {
    const r = runQuery('productivity', FIXTURES)
    expect(r.map((g) => g.id)).toEqual(['b'])
  })

  test('empty query returns all', () => {
    expect(evaluateQuery(null, FIXTURES)).toHaveLength(3)
  })
})

describe('evaluateQuery — fields', () => {
  test('tag: exact match (case-insensitive)', () => {
    expect(runQuery('tag:REACT', FIXTURES).map((g) => g.id)).toEqual(['a'])
    expect(runQuery('tag:nonexistent', FIXTURES)).toHaveLength(0)
  })

  test('domain: hostname substring', () => {
    expect(runQuery('domain:github.com', FIXTURES).map((g) => g.id)).toEqual(['a'])
    expect(runQuery('domain:arxiv', FIXTURES).map((g) => g.id)).toEqual(['c'])
  })

  test('type: exact SourceType match', () => {
    expect(runQuery('type:book', FIXTURES).map((g) => g.id)).toEqual(['b'])
    expect(
      runQuery('type:url', FIXTURES)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['a', 'c'])
  })

  test('title: substring', () => {
    expect(runQuery('title:Deep', FIXTURES).map((g) => g.id)).toEqual(['b'])
  })

  test('text: matches thought or excerpt only', () => {
    expect(runQuery('text:statistics', FIXTURES).map((g) => g.id)).toEqual(['c'])
  })
})

describe('evaluateQuery — dates', () => {
  test('after: (inclusive)', () => {
    expect(
      runQuery('after:2026-05-01', FIXTURES)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['b', 'c'])
  })

  test('before: (inclusive)', () => {
    expect(runQuery('before:2026-04-01', FIXTURES).map((g) => g.id)).toEqual(['a'])
  })

  test('date: exact day', () => {
    expect(runQuery('date:2026-05-20', FIXTURES).map((g) => g.id)).toEqual(['b'])
  })

  test('from:/to: aliases behave like after:/before:', () => {
    expect(runQuery('from:2026-05-01 to:2026-06-30', FIXTURES).map((g) => g.id)).toEqual(['b'])
  })

  test('invalid date falls back to free-text match (no throw)', () => {
    // runQuery recovers from parse errors, so an invalid date becomes a
    // free-text keyword that matches nothing rather than throwing.
    expect(runQuery('after:not-a-date', FIXTURES)).toHaveLength(0)
  })

  test('evaluateQuery still throws on invalid date', () => {
    expect(() => evaluateQuery(parseQuery('after:not-a-date'), FIXTURES)).toThrow(QueryParseError)
  })
})

describe('evaluateQuery — extended syntax', () => {
  test('#tag shorthand matches like tag:', () => {
    expect(runQuery('#react', FIXTURES).map((g) => g.id)).toEqual(['a'])
    expect(runQuery('tag:react', FIXTURES).map((g) => g.id)).toEqual(['a'])
  })

  test('#tag with quoted value', () => {
    const quoted = makeGleam({ id: 'q', tags: ['big idea'] })
    expect(runQuery('#"big idea"', [quoted]).map((g) => g.id)).toEqual(['q'])
  })

  test('>= and <= comparison operators', () => {
    expect(
      runQuery('>=20260501 && <=20260630', FIXTURES)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['b'])
  })

  test('> and < strict operators', () => {
    expect(runQuery('>20260520', FIXTURES).map((g) => g.id)).toEqual(['c'])
    expect(runQuery('<20260310', FIXTURES)).toHaveLength(0)
  })

  test('MMDD omits current year', () => {
    const NOW = new Date(2026, 6, 16, 12, 0, 0, 0)
    const r = evaluateQuery(parseQuery('>=0301'), FIXTURES, NOW)
    expect(r.map((g) => g.id).sort()).toEqual(['a', 'b', 'c'])
  })

  test('in: year range', () => {
    expect(
      runQuery('in:2026', FIXTURES)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['a', 'b', 'c'])
  })

  test('~this-year equals current year', () => {
    const NOW = new Date(2026, 6, 16, 12, 0, 0, 0)
    const r = evaluateQuery(parseQuery('~this-year'), FIXTURES, NOW)
    expect(r.map((g) => g.id).sort()).toEqual(['a', 'b', 'c'])
  })

  test('~YYYY year range', () => {
    expect(runQuery('~2020', FIXTURES)).toHaveLength(0)
    expect(
      runQuery('~2026', FIXTURES)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['a', 'b', 'c'])
  })

  test('~YYYYMm month range', () => {
    expect(runQuery('~2026M3', FIXTURES).map((g) => g.id)).toEqual(['a'])
  })

  test('~Mm current-year month range', () => {
    const NOW = new Date(2026, 6, 16, 12, 0, 0, 0)
    const r = evaluateQuery(parseQuery('~M5'), FIXTURES, NOW)
    expect(r.map((g) => g.id)).toEqual(['b'])
  })

  test('~YYYYQq quarter range', () => {
    expect(runQuery('~2026Q3', FIXTURES).map((g) => g.id)).toEqual(['c'])
  })

  test('~Qq current-year quarter range', () => {
    const NOW = new Date(2026, 6, 16, 12, 0, 0, 0)
    const r = evaluateQuery(parseQuery('~Q1'), FIXTURES, NOW)
    expect(r.map((g) => g.id)).toEqual(['a'])
  })

  test('invalid period throws', () => {
    expect(() => evaluateQuery(parseQuery('~nope'), FIXTURES, new Date(2026, 6, 16))).toThrow(
      QueryParseError,
    )
  })
})

describe('evaluateQuery — boolean logic', () => {
  test('implicit AND between adjacent terms', () => {
    expect(runQuery('tag:react tag:frontend', FIXTURES).map((g) => g.id)).toEqual(['a'])
    expect(runQuery('tag:react tag:ml', FIXTURES)).toHaveLength(0)
  })

  test('explicit AND', () => {
    expect(runQuery('tag:react AND type:url', FIXTURES).map((g) => g.id)).toEqual(['a'])
  })

  test('OR', () => {
    expect(runQuery('type:book OR type:thought', FIXTURES).map((g) => g.id)).toEqual(['b'])
  })

  test('NOT', () => {
    expect(
      runQuery('NOT type:book', FIXTURES)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['a', 'c'])
  })

  test('- prefix shorthand for NOT', () => {
    expect(
      runQuery('-type:book', FIXTURES)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['a', 'c'])
  })

  test('parentheses group OR before AND', () => {
    // tag:ml AND (type:book OR type:url) -> ml is on a url gleam, so matches a/c? c has ml+url
    expect(runQuery('tag:ml AND (type:book OR type:url)', FIXTURES).map((g) => g.id)).toEqual(['c'])
  })

  test('precedence: AND binds tighter than OR', () => {
    // type:book OR tag:react AND tag:frontend
    // = type:book OR (tag:react AND tag:frontend) -> b, a
    expect(
      runQuery('type:book OR tag:react AND tag:frontend', FIXTURES)
        .map((g) => g.id)
        .sort(),
    ).toEqual(['a', 'b'])
  })
})

describe('evaluateQuery — relative dates', () => {
  // NOW in local time so today/this-month resolve deterministically regardless
  // of the test runner's timezone. Relative keywords are values of date fields
  // (e.g. date:today, after:this-month), not standalone keywords.
  const NOW = new Date(2026, 6, 16, 12, 0, 0, 0) // 2026-07-16 local noon

  test('date:today matches only gleams from the current local day', () => {
    const today = makeGleam({ id: 't', created_at: NOW.toISOString() })
    const r = evaluateQuery(parseQuery('date:today'), [today, ...FIXTURES], NOW)
    expect(r.map((g) => g.id)).toEqual(['t'])
  })

  test('after:this-month matches gleams in the current month', () => {
    const sameMonth = new Date(NOW)
    sameMonth.setDate(2)
    const m = makeGleam({ id: 'm', created_at: sameMonth.toISOString() })
    // FIXTURES 'c' is 2026-07-01 (also this month), so both should match.
    const r = evaluateQuery(parseQuery('after:this-month'), [m, ...FIXTURES], NOW)
    expect(r.map((g) => g.id).sort()).toEqual(['c', 'm'])
  })
})

describe('QueryService', () => {
  test('queries the repository', async () => {
    const repo = {
      getAll: async () => FIXTURES,
      getById: async () => null,
      save: async () => {},
      delete: async () => {},
      updateDerivedFields: async () => {},
      renameTag: async () => {},
    }
    const svc = new QueryService(repo)
    const r = await svc.query('type:book')
    expect(r.map((g) => g.id)).toEqual(['b'])
  })
})

describe('runQuery — parse-error fallback', () => {
  test('falls back to free-text match on invalid syntax', () => {
    // Unknown field would throw in parseQuery, but runQuery recovers and
    // treats the raw input as a free-text keyword (matches nothing here).
    const r = runQuery('foo:bar', FIXTURES)
    expect(r).toHaveLength(0)
  })

  test('falls back to free-text match on unbalanced parens', () => {
    const r = runQuery('(tag:react', FIXTURES)
    expect(Array.isArray(r)).toBe(true)
  })
})
