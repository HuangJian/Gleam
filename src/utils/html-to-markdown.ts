import TurndownService from 'turndown'

// Shared turndown instance. Configured for GitHub-flavored-ish output that
// matches the project's Markdown conventions (see utils/markdown.ts):
//   - '-' bullets (not '*')
//   - fenced code blocks (```)
//   - ATX headings (#)
//   - '*' emphasis delimiter
const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
  emDelimiter: '*',
  // Inline links ([text](url)) read better than reference-style in a capture.
  linkStyle: 'inlined',
})

// turndown keeps <script>/<style> text content out of the output by default
// (they are blank/meaningful-when-blank), but we strip the nodes explicitly so
// their (possibly large) raw text never reaches the converter.
turndown.remove(['script', 'style', 'noscript', 'template'])

/**
 * Convert a fragment of page HTML into Markdown, preserving block-level
 * structure (paragraphs, lists, blockquotes, headings) and inline formatting
 * (bold, italic, links, code).
 *
 * @param html       Raw HTML (e.g. from a selection's cloned range).
 * @param fallback   Plain-text fallback used when conversion yields nothing
 *                   (e.g. an empty or script-only fragment).
 */
export function htmlToMarkdown(html: string, fallback = ''): string {
  const markdown = turndown.turndown(html).trim()
  return markdown.length > 0 ? markdown : fallback.trim()
}
