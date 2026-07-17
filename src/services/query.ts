import { Gleam } from '../domain/gleam'
import { IRepository } from '../domain/repository'
import { getSourceHost } from '../utils/review'

/**
 * A lightweight, boolean query language for filtering Gleams.
 *
 * Syntax (field-prefix + boolean):
 *   #react               tag match (exact, case-insensitive). Alias: tag:react
 *   domain:github.com   substring match on the source URL hostname
 *   type:book           exact SourceType match (url/book/conversation/experience/thought)
 *   title:foo           substring match on source.title
 *   text:foo            substring match on thought + source.excerpt
 *   >=20260101          createdAt local date >= value (alias: after:, from:)
 *   <=20260630          createdAt local date <= value (alias: before:, to:)
 *   >20260101 <20260630 same as >= / <= (strict also accepted)
 *   date:20260315       createdAt on that exact day
 *   in:2026             whole-year range (>=20260101 and <=20261231)
 *   ~this-year          alias for in:<current year>
 *   ~2020               year range 2020
 *   ~2026M3             month range March 2026
 *   ~M2                 current-year February
 *   ~2026Q3             quarter range Q3 2026
 *   ~Q1                 current-year Q1
 *   react               bare word = free-text substring over thought, tags, title, excerpt
 *
 * Dates use YYYYMMDD (or MMDD in the current year). Relative keywords
 * (today, yesterday, this-week, this-month, last-week, last-month) are also
 * supported as date-field values.
 *
 * Boolean: AND OR NOT (aliases && || !), parentheses for grouping.
 * Precedence: NOT > AND > OR. Adjacent terms without an operator imply AND.
 * `-term` and `!term` are shorthand for `NOT term`.
 * Quoting: #"big idea", text:"machine learning".
 *
 * This module is pure (no GM/infra deps) so it is trivially unit-testable and
 * keeps the storage adapter replaceable. It is the product's "Recall" capability.
 *
 * ⚠️ 后记（agent 注意）：本文件是查询语言的唯一事实来源（single source of truth）。
 * 若在此修改语法、字段、别名或相对日期，必须同步更新用户文档 `doc/query-language.md`，
 * 以及 `src/ui/components/SearchBar.tsx` 中的示例语句，保持三者一致。
 */

export class QueryParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueryParseError'
  }
}

type Field =
  | 'tag'
  | 'domain'
  | 'type'
  | 'text'
  | 'title'
  | 'after'
  | 'from'
  | 'before'
  | 'to'
  | 'date'
  | 'in'

const FIELD_ALIASES: Record<string, Field> = {
  tag: 'tag',
  domain: 'domain',
  type: 'type',
  text: 'text',
  title: 'title',
  after: 'after',
  from: 'from',
  before: 'before',
  to: 'to',
  date: 'date',
  in: 'in',
}

type Token =
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'op'; op: 'AND' | 'OR' | 'NOT' }
  | { type: 'dateop'; op: '>=' | '<=' | '>' | '<' }
  | { type: 'period'; value: string }
  | { type: 'field'; field: Field; value: string }
  | { type: 'word'; value: string }

export type QueryNode =
  | { kind: 'keyword'; value: string }
  | { kind: 'term'; field: Field; value: string }
  | { kind: 'datecmp'; op: '>=' | '<=' | '>' | '<'; value: string }
  | { kind: 'period'; value: string }
  | { kind: 'not'; expr: QueryNode }
  | { kind: 'and'; left: QueryNode; right: QueryNode }
  | { kind: 'or'; left: QueryNode; right: QueryNode }

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  const n = input.length
  let i = 0
  const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r'

  while (i < n) {
    while (i < n && isSpace(input[i])) i++
    if (i >= n) break

    const c = input[i]

    if (c === '(') {
      tokens.push({ type: 'lparen' })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ type: 'rparen' })
      i++
      continue
    }

    // Quoted string -> bare keyword (e.g. "machine learning")
    if (c === '"') {
      let j = i + 1
      let value = ''
      while (j < n && input[j] !== '"') {
        value += input[j]
        j++
      }
      if (j >= n) throw new QueryParseError('Unterminated quote in query')
      tokens.push({ type: 'word', value })
      i = j + 1
      continue
    }

    // NOT prefix: - or ! immediately followed by a field/word
    if ((c === '-' || c === '!') && i + 1 < n && !isSpace(input[i + 1]) && input[i + 1] !== ')') {
      tokens.push({ type: 'op', op: 'NOT' })
      i++
      continue
    }

    // Tag shorthand: #tag or #"big idea"
    if (c === '#') {
      let j = i + 1
      let value = ''
      if (input[j] === '"') {
        j++
        while (j < n && input[j] !== '"') {
          value += input[j]
          j++
        }
        if (j < n) j++ // closing quote
      } else {
        while (j < n && !isSpace(input[j]) && input[j] !== '(' && input[j] !== ')') {
          value += input[j]
          j++
        }
      }
      if (value === '') throw new QueryParseError('Tag "#" requires a value')
      tokens.push({ type: 'field', field: 'tag', value })
      i = j
      continue
    }

    // Date comparison operators: >= <= > < (each its own token)
    if (c === '>' || c === '<') {
      const two = input[i + 1] === '='
      const op = two ? `${c}=` : c
      tokens.push({ type: 'dateop', op: op as '>=' | '<=' | '>' | '<' })
      i += two ? 2 : 1
      continue
    }

    // Period shorthand: ~this-year / ~2020 / ~2026M3 / ~M2 / ~2026Q3 / ~Q1
    if (c === '~') {
      let j = i + 1
      let value = ''
      while (j < n && !isSpace(input[j]) && input[j] !== '(' && input[j] !== ')') {
        value += input[j]
        j++
      }
      if (value === '') throw new QueryParseError('Period "~" requires a value')
      tokens.push({ type: 'period', value })
      i = j
      continue
    }

    // Raw token until whitespace or paren. Quoted segments (e.g. inside
    // field values like tag:"big idea") are consumed whole, spaces included.
    let j = i
    let raw = ''
    while (j < n && !isSpace(input[j]) && input[j] !== '(' && input[j] !== ')') {
      if (input[j] === '"') {
        raw += '"'
        j++
        while (j < n && input[j] !== '"') {
          raw += input[j]
          j++
        }
        if (j < n) {
          raw += '"'
          j++
        }
        continue
      }
      raw += input[j]
      j++
    }
    i = j

    const upper = raw.toUpperCase()
    if (upper === 'AND' || raw === '&&') {
      tokens.push({ type: 'op', op: 'AND' })
      continue
    }
    if (upper === 'OR' || raw === '||') {
      tokens.push({ type: 'op', op: 'OR' })
      continue
    }
    if (upper === 'NOT') {
      tokens.push({ type: 'op', op: 'NOT' })
      continue
    }

    const colon = raw.indexOf(':')
    if (colon > 0) {
      const name = raw.slice(0, colon).toLowerCase()
      let value = raw.slice(colon + 1)
      if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
        value = value.slice(1, -1)
      }
      const field = FIELD_ALIASES[name]
      if (!field) throw new QueryParseError(`Unknown field "${name}" in query`)
      tokens.push({ type: 'field', field, value })
      continue
    }

    tokens.push({ type: 'word', value: raw })
  }

  return tokens
}

// ---------------------------------------------------------------------------
// Parser (recursive descent, precedence NOT > AND > OR)
// ---------------------------------------------------------------------------

function parse(tokens: Token[]): QueryNode {
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  const isPrimary = (t: Token | undefined): boolean =>
    !!t &&
    (t.type === 'field' ||
      t.type === 'word' ||
      t.type === 'lparen' ||
      t.type === 'dateop' ||
      t.type === 'period')

  function parseOr(): QueryNode {
    let left = parseAnd()
    for (;;) {
      const t = peek()
      if (t?.type === 'op' && t.op === 'OR') {
        next()
        left = { kind: 'or', left, right: parseAnd() }
      } else {
        break
      }
    }
    return left
  }

  function parseAnd(): QueryNode {
    let left = parseNot()
    for (;;) {
      const t = peek()
      if (!t) break
      if (t.type === 'op' && t.op === 'AND') {
        next()
        left = { kind: 'and', left, right: parseNot() }
      } else if (t.type === 'op' && t.op === 'NOT') {
        next()
        left = { kind: 'and', left, right: { kind: 'not', expr: parseNot() } }
      } else if (isPrimary(t)) {
        left = { kind: 'and', left, right: parseNot() } // implicit AND
      } else {
        break
      }
    }
    return left
  }

  function parseNot(): QueryNode {
    const t = peek()
    if (t?.type === 'op' && t.op === 'NOT') {
      next()
      return { kind: 'not', expr: parseNot() }
    }
    return parsePrimary()
  }

  function parsePrimary(): QueryNode {
    const t = peek()
    if (!t) throw new QueryParseError('Unexpected end of query')
    if (t.type === 'lparen') {
      next()
      const expr = parseOr()
      if (peek()?.type !== 'rparen') throw new QueryParseError('Missing closing parenthesis')
      next()
      return expr
    }
    if (t.type === 'period') {
      next()
      if (t.value === '') throw new QueryParseError('Period requires a value')
      return { kind: 'period', value: t.value }
    }
    if (t.type === 'dateop') {
      next()
      const v = peek()
      if (!v || v.type !== 'word')
        throw new QueryParseError(`Date operator "${t.op}" requires a date`)
      next()
      return { kind: 'datecmp', op: t.op, value: v.value }
    }
    if (t.type === 'field') {
      next()
      if (t.value === '') throw new QueryParseError(`Field "${t.field}" requires a value`)
      return { kind: 'term', field: t.field, value: t.value }
    }
    if (t.type === 'word') {
      next()
      return { kind: 'keyword', value: t.value }
    }
    throw new QueryParseError('Unexpected token in query')
  }

  const ast = parseOr()
  if (pos < tokens.length) throw new QueryParseError('Unexpected token after end of query')
  return ast
}

/** Parses a query string into an AST. Returns null for an empty query (match all). */
export function parseQuery(input: string): QueryNode | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const tokens = tokenize(trimmed)
  if (tokens.length === 0) return null
  return parse(tokens)
}

// ---------------------------------------------------------------------------
// Date helpers (local time)
// ---------------------------------------------------------------------------

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfWeek(d: Date): Date {
  const r = startOfDay(d)
  const day = r.getDay() // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7 // days since Monday
  return addDays(r, -diff)
}

function startOfMonth(d: Date): Date {
  const r = startOfDay(d)
  r.setDate(1)
  return r
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n, 1)
  return r
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const RELATIVE_DATES: Record<string, (now: Date) => Date> = {
  today: (now) => startOfDay(now),
  yesterday: (now) => addDays(startOfDay(now), -1),
  'this-week': (now) => startOfWeek(startOfDay(now)),
  'this-month': (now) => startOfMonth(startOfDay(now)),
  'last-week': (now) => addDays(startOfWeek(startOfDay(now)), -7),
  'last-month': (now) => startOfMonth(addMonths(startOfDay(now), -1)),
}

/** Parse a YYYYMMDD (or MMDD in the current year) literal into a Date.
 *  The ISO form YYYY-MM-DD is also accepted for backward compatibility. */
function parseDateLiteral(value: string, now: Date): Date {
  const v = value.trim().replace(/-/g, '')
  let y: number
  let m: number
  let d: number
  if (/^\d{8}$/.test(v)) {
    y = Number(v.slice(0, 4))
    m = Number(v.slice(4, 6))
    d = Number(v.slice(6, 8))
  } else if (/^\d{4}$/.test(v)) {
    y = now.getFullYear()
    m = Number(v.slice(0, 2))
    d = Number(v.slice(2, 4))
  } else {
    throw new QueryParseError(`Invalid date "${value}" (expected YYYYMMDD or MMDD)`)
  }
  const date = new Date(y, m - 1, d)
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    throw new QueryParseError(`Invalid date "${value}"`)
  }
  return date
}

/** Resolve a date value (relative keyword or literal) into a Date. */
function resolveDateValue(value: string, now: Date): Date {
  const key = value.toLowerCase()
  if (RELATIVE_DATES[key]) return RELATIVE_DATES[key](now)
  return parseDateLiteral(value, now)
}

/**
 * Resolve a period expression into an inclusive [start, end] date range.
 * Supports: ~this-year, ~YYYY, ~YYYYMm, ~Mm, ~YYYYQq, ~Qq.
 */
function resolvePeriod(value: string, now: Date): { start: Date; end: Date } {
  const v = value.trim()
  const year = now.getFullYear()

  if (v.toLowerCase() === 'this-year') {
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) }
  }

  const qMatch = v.match(/^Q([1-4])$/i)
  if (qMatch) {
    const q = Number(qMatch[1])
    const startMonth = (q - 1) * 3
    const endMonth = startMonth + 2
    return { start: new Date(year, startMonth, 1), end: new Date(year, endMonth, 31) }
  }

  const mMatch = v.match(/^M(0?[1-9]|1[0-2])$/i)
  if (mMatch) {
    const m = Number(mMatch[1])
    return { start: new Date(year, m - 1, 1), end: new Date(year, m - 1, 31) }
  }

  const yqMatch = v.match(/^(\d{4})Q([1-4])$/i)
  if (yqMatch) {
    const y = Number(yqMatch[1])
    const q = Number(yqMatch[2])
    const startMonth = (q - 1) * 3
    return { start: new Date(y, startMonth, 1), end: new Date(y, startMonth + 2, 31) }
  }

  const ymMatch = v.match(/^(\d{4})M(0?[1-9]|1[0-2])$/i)
  if (ymMatch) {
    const y = Number(ymMatch[1])
    const m = Number(ymMatch[2])
    return { start: new Date(y, m - 1, 1), end: new Date(y, m - 1, 31) }
  }

  const yMatch = v.match(/^(\d{4})$/)
  if (yMatch) {
    const y = Number(yMatch[1])
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) }
  }

  throw new QueryParseError(`Invalid period "${value}"`)
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function matchTerm(node: Extract<QueryNode, { kind: 'term' }>, g: Gleam, now: Date): boolean {
  const v = node.value.toLowerCase()
  switch (node.field) {
    case 'tag':
      return g.tags.some((t) => t.toLowerCase() === v)
    case 'domain':
      return getSourceHost(g.source.url).toLowerCase().includes(v)
    case 'type':
      return g.source.type.toLowerCase() === v
    case 'title':
      return g.source.title.toLowerCase().includes(v)
    case 'text':
      return g.thought.toLowerCase().includes(v) || g.source.excerpt.toLowerCase().includes(v)
    case 'after':
    case 'from':
      return (
        formatLocalDate(new Date(g.createdAt)) >= formatLocalDate(resolveDateValue(node.value, now))
      )
    case 'before':
    case 'to':
      return (
        formatLocalDate(new Date(g.createdAt)) <= formatLocalDate(resolveDateValue(node.value, now))
      )
    case 'date':
      return (
        formatLocalDate(new Date(g.createdAt)) ===
        formatLocalDate(resolveDateValue(node.value, now))
      )
    case 'in': {
      const { start, end } = resolvePeriod(node.value, now)
      const d = formatLocalDate(new Date(g.createdAt))
      return d >= formatLocalDate(start) && d <= formatLocalDate(end)
    }
  }
}

function evalNode(node: QueryNode, g: Gleam, now: Date): boolean {
  switch (node.kind) {
    case 'keyword': {
      const v = node.value.toLowerCase()
      const hay = [g.thought, ...g.tags, g.source.title, g.source.excerpt].join('\n').toLowerCase()
      return hay.includes(v)
    }
    case 'term':
      return matchTerm(node, g, now)
    case 'datecmp': {
      const d = formatLocalDate(new Date(g.createdAt))
      const target = formatLocalDate(resolveDateValue(node.value, now))
      switch (node.op) {
        case '>=':
          return d >= target
        case '<=':
          return d <= target
        case '>':
          return d > target
        case '<':
          return d < target
      }
    }
    case 'period': {
      const { start, end } = resolvePeriod(node.value, now)
      const d = formatLocalDate(new Date(g.createdAt))
      return d >= formatLocalDate(start) && d <= formatLocalDate(end)
    }
    case 'not':
      return !evalNode(node.expr, g, now)
    case 'and':
      return evalNode(node.left, g, now) && evalNode(node.right, g, now)
    case 'or':
      return evalNode(node.left, g, now) || evalNode(node.right, g, now)
  }
}

/** Filters gleams by a parsed query AST. A null AST returns all gleams. */
export function evaluateQuery(
  ast: QueryNode | null,
  gleams: Gleam[],
  now: Date = new Date(),
): Gleam[] {
  if (!ast) return gleams
  return gleams.filter((g) => evalNode(ast, g, now))
}

/**
 * Convenience: parse + evaluate in one call (used by tests and direct callers).
 * On a parse error, falls back to a plain free-text match over the raw input so
 * the search box never breaks — the user always gets some result.
 */
export function runQuery(input: string, gleams: Gleam[], now: Date = new Date()): Gleam[] {
  try {
    return evaluateQuery(parseQuery(input), gleams, now)
  } catch (e) {
    if (e instanceof QueryParseError) {
      return evaluateQuery({ kind: 'keyword', value: input }, gleams, now)
    }
    throw e
  }
}

/**
 * Recall service: runs a query against the repository.
 * Replaces the naive substring `IRepository.search`.
 */
export class QueryService {
  private repository: IRepository

  constructor(repository: IRepository) {
    this.repository = repository
  }

  public async query(input: string): Promise<Gleam[]> {
    const gleams = await this.repository.getAll()
    return runQuery(input, gleams)
  }
}
