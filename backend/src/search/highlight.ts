export interface HighlightField {
  text: string
  weight: number
}

/**
 * Generates a highlight snippet from search results.
 * Finds the first field with a match and returns a snippet around it.
 *
 * @param keywords - pre-extracted keyword strings from the query AST
 *   (use `extractKeywords(ast)` from `shared/query.ts`). These are matched as
 *   substrings against each field's text. Filter values (#tag, domain:, date
 *   operators) are excluded — they match structurally, not as text substrings.
 *
 * This is implemented in TypeScript (not SQL) for:
 * - identical output across databases
 * - identical rendering across clients
 * - simpler testing
 * - easier future migration
 */
export function generateHighlight(keywords: string[], fields: HighlightField[]): string | null {
  if (keywords.length === 0) return null

  const lowerKeywords = keywords.map((k) => k.toLowerCase()).filter((k) => k.length > 0)
  if (lowerKeywords.length === 0) return null

  // Search fields in priority order (highest weight first)
  const sortedFields = [...fields].sort((a, b) => b.weight - a.weight)

  for (const field of sortedFields) {
    if (!field.text) continue
    const lower = field.text.toLowerCase()

    // Find the first matching keyword (earliest position wins)
    let bestPos = -1
    let bestKeyword = ''
    for (const keyword of lowerKeywords) {
      const pos = lower.indexOf(keyword)
      if (pos >= 0 && (bestPos < 0 || pos < bestPos)) {
        bestPos = pos
        bestKeyword = keyword
      }
    }

    if (bestPos >= 0) {
      return buildSnippet(field.text, bestPos, bestKeyword)
    }
  }

  return null
}

function buildSnippet(text: string, matchPos: number, matchToken: string): string {
  const contextBefore = 30
  const contextAfter = 50
  const start = Math.max(0, matchPos - contextBefore)
  const end = Math.min(text.length, matchPos + matchToken.length + contextAfter)

  let snippet = text.slice(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'

  // Wrap the matched token in ** for emphasis
  const lowerSnippet = snippet.toLowerCase()
  const lowerToken = matchToken.toLowerCase()
  const tokenStart = lowerSnippet.indexOf(lowerToken)
  if (tokenStart >= 0) {
    snippet =
      snippet.slice(0, tokenStart) +
      '**' +
      snippet.slice(tokenStart, tokenStart + matchToken.length) +
      '**' +
      snippet.slice(tokenStart + matchToken.length)
  }

  return snippet
}
