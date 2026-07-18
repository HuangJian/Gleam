import { useMemo } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'
import { renderMarkdown } from '../../utils/markdown'

interface MarkdownPreviewProps {
  content: string
  /** Compact mode for card display (smaller fonts, tighter spacing) */
  compact?: boolean
}

export function MarkdownPreview({ content, compact = false }: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(content), [content])

  return <PreviewContainer compact={compact} dangerouslySetInnerHTML={{ __html: html }} />
}

const PreviewContainer = styled.div<{ compact: boolean }>`
  font-family: ${theme.typography.fontFamily};
  font-size: ${(p) => (p.compact ? '13px' : '14px')};
  line-height: 1.7;
  color: ${theme.colors.text.primary};
  word-wrap: break-word;

  /* Headings */
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin-top: ${(p) => (p.compact ? '12px' : '20px')};
    margin-bottom: ${(p) => (p.compact ? '6px' : '10px')};
    font-weight: 600;
    line-height: 1.3;
    color: ${theme.colors.text.primary};
  }

  h1 {
    font-size: ${(p) => (p.compact ? '1.3em' : '1.5em')};
    padding-bottom: 0.3em;
    border-bottom: 1px solid ${theme.colors.border.light};
  }

  h2 {
    font-size: ${(p) => (p.compact ? '1.2em' : '1.35em')};
    padding-bottom: 0.3em;
    border-bottom: 1px solid ${theme.colors.border.light};
  }

  h3 {
    font-size: ${(p) => (p.compact ? '1.1em' : '1.2em')};
  }
  h4 {
    font-size: 1em;
  }
  h5 {
    font-size: 0.9em;
  }
  h6 {
    font-size: 0.85em;
    color: ${theme.colors.text.muted};
  }

  /* First child no top margin */
  > *:first-child {
    margin-top: 0;
  }

  /* Last child no bottom margin */
  > *:last-child {
    margin-bottom: 0;
  }

  /* Paragraphs */
  p {
    margin: 0 0 ${(p) => (p.compact ? '8px' : '12px')};
  }

  /* Bold / italic / strikethrough */
  strong {
    font-weight: 650;
  }
  em {
    font-style: italic;
  }
  del {
    text-decoration: line-through;
    color: ${theme.colors.text.muted};
  }

  /* Links */
  a {
    color: ${theme.colors.text.accent};
    text-decoration: none;
    transition: ${theme.animations.transition};

    &:hover {
      text-decoration: underline;
    }
  }

  /* Inline code */
  code {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.88em;
    background: rgba(200, 180, 140, 0.15);
    padding: 2px 6px;
    border-radius: 4px;
    color: ${theme.colors.text.accent};
  }

  /* Code blocks */
  pre {
    margin: 0 0 ${(p) => (p.compact ? '10px' : '14px')};
    padding: ${(p) => (p.compact ? '10px' : '14px')};
    background: hsl(35, 20%, 14%);
    border-radius: 8px;
    overflow-x: auto;
    border: 1px solid rgba(200, 180, 140, 0.1);

    code {
      background: none;
      padding: 0;
      color: hsl(40, 30%, 88%);
      font-size: 0.85em;
      line-height: 1.5;
    }
  }

  /* Blockquote */
  blockquote {
    margin: 0 0 ${(p) => (p.compact ? '10px' : '14px')};
    padding: ${(p) => (p.compact ? '6px 12px' : '8px 16px')};
    border-left: 3px solid ${theme.colors.brand.primary};
    background: rgba(200, 180, 140, 0.08);
    border-radius: 0 6px 6px 0;
    color: ${theme.colors.text.secondary};

    p {
      margin-bottom: 0;
    }
  }

  /* Lists */
  ul,
  ol {
    margin: 0 0 ${(p) => (p.compact ? '8px' : '12px')};
    padding-left: ${(p) => (p.compact ? '20px' : '26px')};
  }

  li {
    margin-bottom: 4px;

    > p {
      margin-bottom: 4px;
    }
  }

  /* Task list items (GFM) */
  li:has(> input[type='checkbox']) {
    list-style: none;
    margin-left: -20px;
  }

  input[type='checkbox'] {
    margin-right: 6px;
    accent-color: ${theme.colors.brand.primary};
  }

  /* Tables */
  table {
    margin: 0 0 ${(p) => (p.compact ? '10px' : '14px')};
    border-collapse: collapse;
    width: 100%;
    display: block;
    overflow-x: auto;
  }

  th,
  td {
    padding: ${(p) => (p.compact ? '5px 10px' : '7px 13px')};
    border: 1px solid ${theme.colors.border.light};
    text-align: left;
  }

  th {
    background: rgba(200, 180, 140, 0.12);
    font-weight: 600;
  }

  tr:nth-child(even) td {
    background: rgba(200, 180, 140, 0.04);
  }

  /* Horizontal rule */
  hr {
    border: none;
    border-top: 1px solid ${theme.colors.border.light};
    margin: ${(p) => (p.compact ? '12px 0' : '18px 0')};
  }

  /* Images */
  img {
    max-width: 100%;
    border-radius: 8px;
  }
`
