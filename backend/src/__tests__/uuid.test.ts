import { describe, test, expect } from 'bun:test'
import { validateUuidV7, isValidUuidV7 } from '../util/uuid'

describe('validateUuidV7', () => {
  test('accepts valid UUID v7', () => {
    expect(() => validateUuidV7('01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f')).not.toThrow()
  })

  test('throws on invalid UUID (wrong version)', () => {
    expect(() => validateUuidV7('550e8400-e29b-41d4-a716-446655440000')).toThrow('Invalid UUID v7')
  })

  test('throws on non-UUID string', () => {
    expect(() => validateUuidV7('not-a-uuid')).toThrow('Invalid UUID v7')
  })

  test('throws on empty string', () => {
    expect(() => validateUuidV7('')).toThrow('Invalid UUID v7')
  })
})

describe('isValidUuidV7', () => {
  test('returns true for valid UUID v7', () => {
    expect(isValidUuidV7('01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f')).toBe(true)
  })

  test('returns false for UUID v4', () => {
    expect(isValidUuidV7('550e8400-e29b-41d4-a716-446655440000')).toBe(false)
  })

  test('returns false for invalid string', () => {
    expect(isValidUuidV7('invalid')).toBe(false)
  })
})
