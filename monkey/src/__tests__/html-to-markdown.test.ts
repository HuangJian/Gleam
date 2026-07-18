import { describe, test, expect } from 'bun:test'
import { htmlToMarkdown } from '../utils/html-to-markdown'

describe('htmlToMarkdown', () => {
  test('converts a paragraph', () => {
    expect(htmlToMarkdown('<p>Hello world</p>')).toBe('Hello world')
  })

  test('converts an unordered list', () => {
    const md = htmlToMarkdown('<ul><li>one</li><li>two</li></ul>')
    expect(md).toContain('-   one')
    expect(md).toContain('-   two')
  })

  test('converts an ordered list', () => {
    const md = htmlToMarkdown('<ol><li>first</li><li>second</li></ol>')
    expect(md).toContain('1.  first')
    expect(md).toContain('2.  second')
  })

  test('converts a nested list', () => {
    const md = htmlToMarkdown('<ul><li>top<ul><li>child</li></ul></li></ul>')
    expect(md).toContain('-   top')
    expect(md).toContain('    -   child')
  })

  test('converts a blockquote', () => {
    expect(htmlToMarkdown('<blockquote>quoted text</blockquote>')).toBe('> quoted text')
  })

  test('converts headings with ATX style', () => {
    expect(htmlToMarkdown('<h2>Title</h2>')).toBe('## Title')
  })

  test('converts bold and italic', () => {
    const md = htmlToMarkdown('<p><strong>bold</strong> and <em>italic</em></p>')
    expect(md).toContain('**bold**')
    expect(md).toContain('*italic*')
  })

  test('converts inline links', () => {
    const md = htmlToMarkdown('<p>see <a href="https://x.com">this</a> now</p>')
    expect(md).toContain('[this](https://x.com)')
  })

  test('converts inline code', () => {
    expect(htmlToMarkdown('<p>use <code>foo()</code> here</p>')).toBe('use `foo()` here')
  })

  test('converts a mix of blocks', () => {
    const md = htmlToMarkdown(
      '<h3>Section</h3><p>Intro <strong>note</strong>.</p><ul><li>a</li><li>b</li></ul>',
    )
    expect(md).toContain('### Section')
    expect(md).toContain('Intro **note**.')
    expect(md).toContain('-   a')
    expect(md).toContain('-   b')
  })

  test('strips script and style content', () => {
    const md = htmlToMarkdown(
      '<p>visible</p><script>const x = "secret";</script><style>.a{color:red}</style>',
    )
    expect(md).toBe('visible')
  })

  test('falls back to plain text when conversion is empty', () => {
    expect(htmlToMarkdown('<script>x</script>', 'plain fallback')).toBe('plain fallback')
  })
})
