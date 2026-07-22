import styled from '@emotion/styled'
import { Gleam } from '../../domain/gleam'
import type { GleamIntelligence } from '../../domain/intelligence'
import { theme } from '../theme'
import { MarkdownPreview } from './MarkdownPreview'
import { HighlightText } from './HighlightText'

interface GleamCardProps {
  gleam: Gleam
  intelligence?: GleamIntelligence
  onRevisit: (id: string) => void
  onClick?: (gleam: Gleam) => void
  selected?: boolean
  highlight?: string | null
  /** 1-based position of this gleam within the current search result set. */
  index?: number
  /** Total number of gleams in the current result set (for `index/total`). */
  total?: number
}

export function GleamCard({
  gleam,
  intelligence,
  onRevisit,
  onClick,
  selected = false,
  highlight = null,
  index,
  total,
}: GleamCardProps) {
  const handleCardClick = () => {
    onRevisit(gleam.id)
    onClick?.(gleam)
  }

  const summary = intelligence?.summary ?? null

  return (
    <Card $selected={selected} onClick={handleCardClick}>
      {index != null && <IndexBadge>{total != null ? `${index}/${total}` : index}</IndexBadge>}

      {summary && (
        <CardHeader>
          <AIPrefix>✦</AIPrefix>
          <AISummaryText>{summary}</AISummaryText>
        </CardHeader>
      )}

      <ThoughtText>
        {highlight ? (
          <HighlightText text={highlight} />
        ) : (
          <MarkdownPreview content={gleam.thought} compact />
        )}
      </ThoughtText>
    </Card>
  )
}

const Card = styled.div<{ $selected: boolean }>`
  background: ${(p) => (p.$selected ? 'rgba(255, 253, 248, 1)' : theme.colors.bg.card)};
  border: 1px solid ${(p) => (p.$selected ? theme.colors.border.focus : theme.colors.border.card)};
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: ${theme.animations.transition};
  position: relative;
  overflow: hidden;

  &:hover {
    border-color: ${theme.colors.border.light};
    transform: translateY(-2px);
    background: rgba(255, 253, 248, 1);
    box-shadow: 0 4px 20px rgba(120, 100, 60, 0.12);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: 100%;
    background: ${theme.colors.brand.primary};
    opacity: ${(p) => (p.$selected ? 1 : 0.8)};
  }
`

const IndexBadge = styled.span`
  position: absolute;
  bottom: 0px;
  right: 0;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  color: ${theme.colors.text.muted};
  background: rgba(200, 180, 140, 0.12);
  border: 1px solid ${theme.colors.border.card};
  border-radius: 50%;
  z-index: 1;
`

const CardHeader = styled.div`
  display: flex;
  align-items: baseline;
  gap: 4px;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.4;
  color: ${theme.colors.intelligence.summaryText};
  font-style: italic;
`

const AIPrefix = styled.span`
  color: ${theme.colors.intelligence.accent};
  flex-shrink: 0;
`

const AISummaryText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`

const ThoughtText = styled.div`
  font-size: 14px;
  line-height: 1.6;
  color: ${theme.colors.text.primary};
  font-weight: 450;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`
