import { describe, test, expect } from 'bun:test'
import { tokenize } from '../search/tokenizer'

describe('tokenize', () => {
  test('splits latin words on whitespace', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world'])
  })

  test('splits latin words on punctuation', () => {
    expect(tokenize('hello, world!')).toEqual(['hello', 'world'])
  })

  test('lowercases all tokens', () => {
    expect(tokenize('Hello WORLD')).toEqual(['hello', 'world'])
  })

  test('splits CJK characters individually', () => {
    expect(tokenize('机器学习')).toEqual(['机', '器', '学', '习'])
  })

  test('handles mixed CJK and latin', () => {
    expect(tokenize('React 学习')).toEqual(['react', '学', '习'])
  })

  test('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([])
  })

  test('returns empty array for whitespace-only string', () => {
    expect(tokenize('   ')).toEqual([])
  })

  test('handles Japanese hiragana', () => {
    expect(tokenize('こんにちは')).toEqual(['こ', 'ん', 'に', 'ち', 'は'])
  })

  test('preserves numbers', () => {
    expect(tokenize('version 2.0')).toEqual(['version', '2', '0'])
  })
})
