import { describe, test, expect } from 'bun:test'
import { preprocessMarkdown, renderMarkdown } from '../utils/markdown'

describe('preprocessMarkdown', () => {
  test('closes a blockquote when a non-quote line follows', () => {
    const src = '> quotation\nI am not a quotation'
    const out = preprocessMarkdown(src)
    expect(out).toBe('> quotation\n\nI am not a quotation')
  })

  test('keeps consecutive quote lines merged into one blockquote', () => {
    const src = '> line one\n> line two'
    const out = preprocessMarkdown(src)
    expect(out).toBe('> line one\n> line two')
  })

  test('joins an indented line after a blockquote into the quote', () => {
    const src = '> quotation\n    indented after quote'
    const out = preprocessMarkdown(src)
    expect(out).toBe('> quotation indented after quote')
  })

  test('leaves non-quote content untouched', () => {
    const src = 'plain line one\nplain line two'
    const out = preprocessMarkdown(src)
    expect(out).toBe('plain line one\nplain line two')
  })

  test('joins a whitespace-indented line as a continuation of the previous line', () => {
    const src = 'A long sentance \n    could be splitted\n    into multiple\n    lines.'
    const out = preprocessMarkdown(src)
    expect(out).toBe('A long sentance could be splitted into multiple lines.')
  })

  test('joins indented plain-text continuation for a bullet point', () => {
    const src =
      '- a bullet point line \n    could be splitted as well\n- this is another bullet point'
    const out = preprocessMarkdown(src)
    expect(out).toBe(
      '- a bullet point line could be splitted as well\n- this is another bullet point',
    )
  })

  test('preserves nested list items as separate format lines', () => {
    const src = '- item 1\n    - item 1.a\n    - item 1.b\n- item 2'
    const out = preprocessMarkdown(src)
    expect(out).toBe('- item 1\n    - item 1.a\n    - item 1.b\n- item 2')
  })

  test('preserves indented format lines (heading, ordered list, blockquote)', () => {
    const src = '# title\n    - nested bullet\n    2. nested ordered\n    > nested quote'
    const out = preprocessMarkdown(src)
    expect(out).toBe('# title\n    - nested bullet\n    2. nested ordered\n    > nested quote')
  })

  test('does not join a blank line as a continuation', () => {
    const src = 'A long sentance \n\n    indented after blank'
    const out = preprocessMarkdown(src)
    expect(out).toBe('A long sentance \n\n    indented after blank')
  })

  test('does not join an indented line at the very start', () => {
    const src = '    indented first line\nnormal'
    const out = preprocessMarkdown(src)
    expect(out).toBe('    indented first line\nnormal')
  })
})

describe('renderMarkdown', () => {
  test('renders a quote and a following line as separate blocks', () => {
    const html = renderMarkdown('> quotation\nI am not a quotation')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<p>quotation</p>')
    expect(html).toContain('<p>I am not a quotation</p>')
    // The non-quote line must not be inside the blockquote.
    expect(html.indexOf('I am not a quotation')).toBeGreaterThan(html.indexOf('</blockquote>'))
  })

  test('renders consecutive quote lines as one blockquote', () => {
    const html = renderMarkdown('> line one\n> line two')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<p>line one<br>line two</p>')
  })

  test('renders plain paragraphs without blockquotes', () => {
    const html = renderMarkdown('plain line one\nplain line two')
    expect(html).not.toContain('<blockquote>')
    expect(html).toContain('<p>plain line one<br>plain line two</p>')
  })

  test('renders a soft-wrapped paragraph as a single block', () => {
    const html = renderMarkdown(
      'A long sentance \n    could be splitted\n    into multiple\n    lines.',
    )
    expect(html).toContain('<p>A long sentance could be splitted into multiple lines.</p>')
  })

  test('renders soft-wrapped bullet points as separate list items', () => {
    const html = renderMarkdown(
      '- a bullet point line \n    could be splitted as well\n- this is another bullet point',
    )
    expect(html).toContain('<li>a bullet point line could be splitted as well</li>')
    expect(html).toContain('<li>this is another bullet point</li>')
  })

  test('preserves nested list items as separate list items', () => {
    const html = renderMarkdown('- item 1\n    - item 1.a\n    - item 1.b\n- item 2')
    // Nested items are rendered as a nested <ul> under "item 1", not soft-wrapped.
    expect(html).toContain('<li>item 1')
    expect(html).toContain('<li>item 1.a</li>')
    expect(html).toContain('<li>item 1.b</li>')
    expect(html).toContain('<li>item 2</li>')
  })
})
