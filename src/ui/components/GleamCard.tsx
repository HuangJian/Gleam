import styled from '@emotion/styled'
import { Gleam } from '../../domain/gleam'
import { theme } from '../theme'
import { MarkdownPreview } from './MarkdownPreview'
import { MediaPreview } from './MediaPreview'
import { SourceExcerpt } from './SourceExcerpt'
import { TagCount } from '../../services/tag'

interface GleamCardProps {
  gleam: Gleam
  onRevisit: (id: string) => void
  onClick?: (gleam: Gleam) => void
  selected?: boolean
  tagCounts?: TagCount[]
}

export function GleamCard({
  gleam,
  onRevisit,
  onClick,
  selected = false,
  tagCounts = [],
}: GleamCardProps) {
  const getFormattedTime = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const getSourceHost = (url: string) => {
    if (!url) return ''
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }

  const handleCardClick = () => {
    onRevisit(gleam.id)
    onClick?.(gleam)
  }

  const countMap = new Map(tagCounts.map((tc) => [tc.tag, tc.count]))
  const sortedTags = gleam.tags
    .slice()
    .sort((a, b) => (countMap.get(b) ?? 0) - (countMap.get(a) ?? 0))

  return (
    <Card $selected={selected} onClick={handleCardClick}>
      <CardHeader>
        <HeaderLeft>
          <TimeLabel>{getFormattedTime(gleam.createdAt)}</TimeLabel>
          {sortedTags.length > 0 && (
            <TagChips>
              {sortedTags.map((tag) => (
                <TagChip key={tag} title={`${tag} · 用于 ${countMap.get(tag) ?? 0} 条拾光`}>
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
        <MarkdownPreview content={gleam.thought} compact />
      </ThoughtText>

      {gleam.source.excerpt && <SourceExcerpt text={gleam.source.excerpt} compact />}

      {gleam.source.media && <MediaPreview media={gleam.source.media} compact />}

      {gleam.source.url && (
        <SourceFooter>
          <SourceIcon viewBox="0 0 24 24">
            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
          </SourceIcon>
          <LinkAnchor
            href={gleam.source.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e: MouseEvent) => e.stopPropagation()}
            title={gleam.source.url}
          >
            {gleam.source.title || getSourceHost(gleam.source.url) || '原始页面'}
          </LinkAnchor>
          <SourceHost>{getSourceHost(gleam.source.url)}</SourceHost>
        </SourceFooter>
      )}
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

const TagChip = styled.span`
  flex-shrink: 0;
  background: rgba(200, 180, 140, 0.15);
  border: 1px solid ${theme.colors.border.light};
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

const SourceFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 1px solid rgba(200, 180, 140, 0.15);
  padding-top: 10px;
  margin-top: 4px;
`

const SourceIcon = styled.svg`
  width: 12px;
  height: 12px;
  fill: ${theme.colors.text.muted};
  flex-shrink: 0;
`

const LinkAnchor = styled.a`
  font-size: 12px;
  color: ${theme.colors.text.secondary};
  text-decoration: none;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.accent};
    text-decoration: underline;
  }
`

const SourceHost = styled.span`
  font-size: 10px;
  color: ${theme.colors.text.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  text-align: right;
`
