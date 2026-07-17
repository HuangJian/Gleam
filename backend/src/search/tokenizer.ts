/**
 * Tokenizer for full-text search.
 *
 * V1 uses a simple Unicode-aware tokenizer that:
 * - Splits on whitespace and punctuation
 * - Lowercases all tokens
 * - Preserves CJK characters as individual tokens
 *
 * This is replaceable. Search depends only on the Tokenizer interface.
 */

export interface Token {
  text: string
}

/**
 * Tokenizes a query string into search tokens.
 * CJK characters (Chinese, Japanese, Korean) are split individually,
 * while Latin/number sequences are kept as whole words.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  const lower = text.toLowerCase().trim()
  if (!lower) return tokens

  // Match: CJK characters individually, or sequences of latin/digit chars
  const tokenRegex = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff]|[\w]+/g

  let match: RegExpExecArray | null
  while ((match = tokenRegex.exec(lower)) !== null) {
    const word = match[0]
    if (word.length > 0) {
      tokens.push(word)
    }
  }

  return tokens
}
