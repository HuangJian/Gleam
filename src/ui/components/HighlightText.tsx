import styled from '@emotion/styled'
import { theme } from '../theme'

interface HighlightTextProps {
  text: string
}

/**
 * Renders a search highlight snippet. The server wraps matched keywords in
 * `**` markers (e.g. `**React** hooks are powerful`). This component parses
 * the markers and renders the matched portions as <mark> elements.
 */
export function HighlightText({ text }: HighlightTextProps) {
  // Split on ** — odd-indexed segments are highlighted
  const parts = text.split('**')
  return (
    <Container>
      {parts.map((part, i) =>
        i % 2 === 1 ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
      )}
    </Container>
  )
}

const Container = styled.span`
  font-size: 14px;
  line-height: 1.6;
  color: ${theme.colors.text.primary};
  font-weight: 450;

  mark {
    background: ${theme.colors.brand.glow};
    color: ${theme.colors.text.accent};
    font-weight: 600;
    border-radius: 3px;
    padding: 0 2px;
  }
`
