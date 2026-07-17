import { describe, test, expect } from 'bun:test'
import { formatReviewTime, getSourceHost } from '../utils/review'

describe('formatReviewTime', () => {
  test('formats an ISO timestamp with date and time', () => {
    const out = formatReviewTime('2026-07-14T09:05:00.000Z')
    // Locale-dependent, but must contain the date pieces and a time separator.
    expect(out).toMatch(/2026/)
    expect(out).toMatch(/:/)
  })

  test('does not throw on a valid ISO string', () => {
    expect(() => formatReviewTime(new Date().toISOString())).not.toThrow()
  })
})

describe('getSourceHost', () => {
  test('extracts the hostname from a full URL', () => {
    expect(getSourceHost('https://example.com/path?q=1')).toBe('example.com')
  })

  test('returns empty string for empty input', () => {
    expect(getSourceHost('')).toBe('')
  })

  test('returns empty string for an invalid URL', () => {
    expect(getSourceHost('not a url')).toBe('')
  })
})
