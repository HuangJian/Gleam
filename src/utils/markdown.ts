import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Configure marked for GitHub-flavored markdown
// https://marked.js.org/using_advanced
marked.setOptions({
  gfm: true,
  breaks: true,
})

// DOMPurify is a factory that needs a DOM window. In the browser it resolves
// the global window automatically; in test environments (happy-dom) we must
// pass the window explicitly so sanitize() is available. Calling it with the
// current window works in both contexts.
const purify = DOMPurify(window)

/**
 * Normalize raw markdown to enforce Gleam's wrapping and quote conventions.
 *
 * 1. Soft-wrapped lines. A line whose text begins with whitespace is treated as
 *    a continuation of the previous line ONLY when it is plain text (not a
 *    markdown format line such as a list item, heading, or blockquote): its
 *    leading whitespace is collapsed to a single space and appended back, so it
 *    renders as one paragraph / list item / blockquote line. Indented format
 *    lines (e.g. nested `- item`) are preserved as their own blocks.
 * 2. Blockquote lazy continuation is disabled. A non-quote, non-indented line
 *    that follows a '>' line closes the preceding blockquote (a blank line is
 *    inserted), so it renders as its own paragraph instead of being swallowed
 *    into the quote.
 */
export function preprocessMarkdown(src: string): string {
  const lines = src.split('\n')
  const out: string[] = []

  // A line is a markdown format line (and must be preserved, not soft-wrapped)
  // when, after its leading indentation, it starts with a list bullet, an
  // ordered-list marker, a heading, or a blockquote marker.
  const isFormatLine = (line: string): boolean => /^\s*([-*+]\s|\d+[.)]\s|#{1,6}\s|>)/.test(line)

  for (const line of lines) {
    const prev = out.length > 0 ? out[out.length - 1] : ''

    // Soft-wrap: an indented plain-text line continues the previous line.
    if (line.length > 0 && /^\s/.test(line) && prev.length > 0 && !isFormatLine(line)) {
      out[out.length - 1] = `${prev.replace(/\s+$/, '')} ${line.trimStart()}`
      continue
    }

    // close a blockquote when a non-quote line follows a quote line.
    if (prev.startsWith('>') && !line.startsWith('>')) {
      out.push('')
    }

    out.push(line)
  }

  return out.join('\n')
}

/**
 * Render markdown text to sanitized HTML.
 * Uses marked for parsing (GFM) and DOMPurify for XSS prevention.
 * Safe to inject into innerHTML.
 */
export function renderMarkdown(text: string): string {
  const normalized = preprocessMarkdown(text)
  const rawHtml = marked.parse(normalized, { async: false }) as string
  return purify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'hr',
      'strong',
      'em',
      'del',
      's',
      'mark',
      'blockquote',
      'code',
      'pre',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'a',
      'img',
      'input', // for GFM task lists
      'span',
      'div',
    ],
    ALLOWED_ATTR: [
      'href',
      'src',
      'alt',
      'title',
      'class',
      'target',
      'rel',
      'type',
      'checked',
      'disabled',
    ],
  })
}
