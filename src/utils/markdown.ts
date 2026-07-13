import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Configure marked for GitHub-flavored markdown
marked.setOptions({
  gfm: true,
  breaks: true,
})

/**
 * Render markdown text to sanitized HTML.
 * Uses marked for parsing (GFM) and DOMPurify for XSS prevention.
 * Safe to inject into innerHTML.
 */
export function renderMarkdown(text: string): string {
  const rawHtml = marked.parse(text, { async: false }) as string
  return DOMPurify.sanitize(rawHtml, {
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
