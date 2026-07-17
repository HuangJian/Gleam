import { describe, test, expect } from 'bun:test'
import { generateHighlight } from '../search/highlight'

describe('generateHighlight', () => {
  test('returns null for empty query', () => {
    expect(generateHighlight('', [{ text: 'hello', weight: 1 }])).toBeNull()
  })

  test('wraps matched token in **', () => {
    const result = generateHighlight('hello', [{ text: 'hello world', weight: 1 }])
    expect(result).toContain('**hello**')
  })

  test('adds ellipsis when match is not at the start', () => {
    const longText = 'A'.repeat(60) + ' hello ' + 'B'.repeat(60)
    const result = generateHighlight('hello', [{ text: longText, weight: 1 }])
    expect(result).toContain('...')
  })

  test('searches highest-weight field first', () => {
    const result = generateHighlight('match', [
      { text: 'no match here', weight: 1 },
      { text: 'match in high weight field', weight: 10 },
    ])
    expect(result).toContain('**match**')
    expect(result).toContain('high weight field')
  })

  test('returns null when no field matches', () => {
    const result = generateHighlight('nonexistent', [{ text: 'hello world', weight: 1 }])
    expect(result).toBeNull()
  })

  test('handles CJK tokens', () => {
    const result = generateHighlight('机器', [{ text: '机器学习很有趣', weight: 1 }])
    expect(result).toContain('**')
  })
})
