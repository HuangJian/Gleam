import styled from '@emotion/styled'
import { theme } from '../theme'

interface SourceExcerptProps {
  /** The captured source text (e.g. a selected passage). */
  text: string
  /** Compact mode for card/list display (smaller fonts, tighter, clamped). */
  compact?: boolean
}

/**
 * Renders a captured source reference (the "触发语境" / excerpt a gleam was
 * captured from). It uses a deliberately neutral visual language — a gray left
 * border and a "来源引用" caption — so it is never confused with a blockquote
 * the user wrote inside their own thought (which uses the gold brand style via
 * MarkdownPreview).
 */
export function SourceExcerpt({ text, compact = false }: SourceExcerptProps) {
  return (
    <Wrapper $compact={compact}>
      <Caption $compact={compact}>来源引用</Caption>
      <Quote $compact={compact}>“{text}”</Quote>
    </Wrapper>
  )
}

const Wrapper = styled.figure<{ $compact: boolean }>`
  margin: 0;
  padding: ${(p) => (p.$compact ? '8px 12px' : '12px 16px')};
  background: ${theme.colors.reference.bg};
  border-left: 3px solid ${theme.colors.reference.border};
  border-radius: 0 8px 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  ${(p) =>
    !p.$compact &&
    `
    max-height: 180px;
    overflow-y: auto;
    overscroll-behavior: contain;
  `}
`

const Caption = styled.figcaption<{ $compact: boolean }>`
  font-size: ${(p) => (p.$compact ? '9px' : '10px')};
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  color: ${theme.colors.reference.caption};
`

const Quote = styled.blockquote<{ $compact: boolean }>`
  margin: 0;
  font-size: ${(p) => (p.$compact ? '12px' : '13.5px')};
  color: ${theme.colors.reference.text};
  line-height: 1.5;
  font-style: italic;
  ${(p) =>
    p.$compact &&
    `
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  `}
`
