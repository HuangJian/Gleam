import { describe, test, expect } from 'bun:test'
import { generateUUIDv7, getTimestampFromUUIDv7 } from '../utils/uuid'
import { createGleam } from '../domain/gleam'

describe('UUID v7', () => {
  test('should generate a valid UUID v7 format', () => {
    const uuid = generateUUIDv7()
    // Format matches: 8-4-4-4-12 hex characters
    // Version digit must be 7 (character 14)
    expect(uuid).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i)
  })

  test('should extract correct timestamp from UUID v7', () => {
    const before = Date.now()
    const uuid = generateUUIDv7()
    const after = Date.now()

    const timestamp = getTimestampFromUUIDv7(uuid)
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(after)
  })
})

describe('Gleam Domain Model', () => {
  test('should construct a valid Gleam object', () => {
    const id = generateUUIDv7()
    const thought = ' This is my understanding. '
    const source = {
      type: 'url' as const,
      url: 'https://example.com',
      title: 'Example Page',
      excerpt: '  An interesting quote  ',
    }

    const gleam = createGleam(id, thought, source)

    expect(gleam.id).toBe(id)
    expect(gleam.thought).toBe('This is my understanding.')
    expect(gleam.source.type).toBe('url')
    expect(gleam.source.excerpt).toBe('An interesting quote')
    expect(gleam.revisit_count).toBe(0)

    const time = new Date(gleam.created_at).getTime()
    expect(time).toBeGreaterThanOrEqual(Date.now() - 5000)
    expect(time).toBeLessThanOrEqual(Date.now() + 5000)
  })

  test('should throw error for empty thoughts', () => {
    const id = generateUUIDv7()
    const source = { type: 'url' as const, url: 'https://example.com' }

    expect(() => createGleam(id, '', source)).toThrow('Thought cannot be empty')
    expect(() => createGleam(id, '   ', source)).toThrow('Thought cannot be empty')
  })

  test('should preserve a media source anchor when provided', () => {
    const id = generateUUIDv7()
    const source = {
      type: 'url' as const,
      url: 'https://example.com/photo.png',
      title: 'Example Page',
      media: { kind: 'image' as const, src: 'https://example.com/photo.png' },
    }

    const gleam = createGleam(id, 'A visual insight.', source)

    expect(gleam.source.media).toEqual({
      kind: 'image',
      src: 'https://example.com/photo.png',
    })
  })

  test('should leave media undefined when no media is provided', () => {
    const id = generateUUIDv7()
    const source = { type: 'url' as const, url: 'https://example.com' }

    const gleam = createGleam(id, 'A thought.', source)

    expect(gleam.source.media).toBeUndefined()
  })
})
