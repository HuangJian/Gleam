import styled from '@emotion/styled'
import { Gleam } from '../../domain/gleam'
import type { GleamIntelligence } from '../../domain/intelligence'
import { theme } from '../theme'
import { MarkdownPreview } from './MarkdownPreview'
import { MediaPreview } from './MediaPreview'
import { HighlightText } from './HighlightText'
import { TagCount } from '../../services/tag'

interface GleamCardProps {
  gleam: Gleam
  intelligence?: GleamIntelligence
  onRevisit: (id: string) => void
  onClick?: (gleam: Gleam) => void
  selected?: boolean
  tagCounts?: TagCount[]
  highlight?: string | null
}

export function GleamCard({
  gleam,
  intelligence,
  onRevisit,
  onClick,
  selected = false,
  tagCounts = [],
  highlight = null,
}: GleamCardProps) {
  const getFormattedTime = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const handleCardClick = () => {
    onRevisit(gleam.id)
    onClick?.(gleam)
  }

  const countMap = new Map(tagCounts.map((tc) => [tc.tag, tc.count]))
  const sortedTags = gleam.tags
    .slice()
    .sort((a, b) => (countMap.get(b) ?? 0) - (countMap.get(a) ?? 0))

  const aiTagSet = new Set(intelligence?.aiTags ?? [])
  const isAITag = (tag: string) => aiTagSet.has(tag)

  const summary = intelligence?.summary ?? null

  return (
    <Card $selected={selected} onClick={handleCardClick}>
      <CardHeader>
        <HeaderLeft>
          <TimeLabel>{getFormattedTime(gleam.createdAt)}</TimeLabel>
          {sortedTags.length > 0 && (
            <TagChips>
              {sortedTags.map((tag) => (
                <TagChip
                  key={tag}
                  $ai={isAITag(tag)}
                  title={`${tag} · 用于 ${countMap.get(tag) ?? 0} 条拾光`}
                >
                  {isAITag(tag) && <span>✦</span>}
                  {tag}
                </TagChip>
              ))}
            </TagChips>
          )}
        </HeaderLeft>
        <HeaderActions>
          {gleam.revisitCount > 0 ? (
            <RevisitBadge title={`回顾次数: ${gleam.revisitCount}`}>
              👁 {gleam.revisitCount}
            </RevisitBadge>
          ) : null}
        </HeaderActions>
      </CardHeader>

      <ThoughtText>
        {highlight ? (
          <HighlightText text={highlight} />
        ) : (
          <MarkdownPreview content={gleam.thought} compact />
        )}
      </ThoughtText>

      {summary && (
        <AISummaryText>
          <AIPrefix>✦</AIPrefix>
          {summary}
        </AISummaryText>
      )}

      {gleam.source.media && <MediaPreview media={gleam.source.media} compact />}
    </Card>
  )
}

const Card = styled.div<{ $selected: boolean }>`
  background: ${(p) => (p.$selected ? 'rgba(255, 253, 248, 1)' : theme.colors.bg.card)};
  border: 1px solid ${(p) => (p.$selected ? theme.colors.border.focus : theme.colors.border.card)};
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: nowrap;
  overflow: hidden;
  gap: 8px;
`

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  flex-wrap: nowrap;
`

const TimeLabel = styled.span`
  font-size: 11px;
  color: ${theme.colors.text.muted};
  font-weight: 500;
  flex-shrink: 0;
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const RevisitBadge = styled.span`
  font-size: 11px;
  background: rgba(200, 180, 140, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  color: ${theme.colors.text.muted};
`

const TagChips = styled.div`
  display: flex;
  flex-wrap: nowrap;
  overflow: hidden;
  gap: 6px;
  max-height: 22px;
  min-width: 0;
`

const TagChip = styled.span<{ $ai: boolean }>`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: ${(p) => (p.$ai ? theme.colors.intelligence.tagBg : 'rgba(200, 180, 140, 0.15)')};
  border: 1px ${(p) => (p.$ai ? 'dashed' : 'solid')}
    ${(p) => (p.$ai ? theme.colors.intelligence.tagBorder : theme.colors.border.light)};
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 11px;
  color: ${theme.colors.text.secondary};
  white-space: nowrap;
`

const ThoughtText = styled.div`
  font-size: 14px;
  line-height: 1.6;
  color: ${theme.colors.text.primary};
  font-weight: 450;
  max-height: 4.8em;
  overflow-y: auto;
  overscroll-behavior: contain;
`

const AISummaryText = styled.div`
  display: flex;
  gap: 4px;
  font-size: 12.5px;
  line-height: 1.5;
  color: ${theme.colors.intelligence.summaryText};
  font-style: italic;
`

const AIPrefix = styled.span`
  color: ${theme.colors.intelligence.accent};
  flex-shrink: 0;
`
