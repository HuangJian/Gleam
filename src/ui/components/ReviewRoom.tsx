import { useState, useEffect } from 'preact/hooks'
import styled from '@emotion/styled'
import { Gleam } from '../../domain/gleam'
import { TimelineGroup } from '../../services/timeline'
import { GleamCard } from './GleamCard'
import { SearchBar } from './SearchBar'
import { MarkdownPreview } from './MarkdownPreview'
import { MediaPreview } from './MediaPreview'
import { TagEditor } from './TagEditor'
import { TagCount } from '../../services/tag'
import { theme } from '../theme'
import { METEOR_ICON_URL } from '../assets'
import { formatReviewTime, getSourceHost } from '../../utils/review'

interface ReviewRoomProps {
  isOpen: boolean
  onClose: () => void
  timelineGroups: TimelineGroup[]
  onRevisitGleam: (id: string) => Promise<void>
  onSearch: (query: string) => void
  onExport: () => void
  onAddGleam: () => void
  viewingGleam: Gleam | null
  onOpenGleam: (gleam: Gleam) => void
  onCloseDetail: () => void
  tagCounts: TagCount[]
  onAddTag: (gleamId: string, tag: string) => Promise<void>
  onRemoveTag: (gleamId: string, tag: string) => Promise<void>
}

export function ReviewRoom({
  isOpen,
  onClose,
  timelineGroups,
  onRevisitGleam,
  onSearch,
  onExport,
  onAddGleam,
  viewingGleam,
  onOpenGleam,
  onCloseDetail,
  tagCounts,
  onAddTag,
  onRemoveTag,
}: ReviewRoomProps) {
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    onSearch(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  const countMap = new Map(tagCounts.map((tc) => [tc.tag, tc.count]))
  const sortedTags = viewingGleam
    ? (viewingGleam.tags ?? [])
        .slice()
        .sort((a, b) => (countMap.get(b) ?? 0) - (countMap.get(a) ?? 0))
    : []

  const handleCardClick = (gleam: Gleam) => {
    onOpenGleam(gleam)
    void onRevisitGleam(gleam.id)
  }

  return (
    <Overlay data-testid="review-room">
      <Layout>
        <ListColumn>
          <Header>
            <HeaderTitle>
              <GleamIcon src={METEOR_ICON_URL} alt="" />
              <span>拾光 · 认知演化的轨迹</span>
            </HeaderTitle>
            <HeaderActions>
              <AddButton onClick={onAddGleam} title="添加拾光 (无来源)">
                <svg viewBox="0 0 24 24">
                  <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" />
                </svg>
              </AddButton>
              <ExportButton onClick={onExport} title="导出所有拾光记录 (JSON)">
                <svg viewBox="0 0 24 24">
                  <path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z" />
                </svg>
              </ExportButton>
              <CloseButton onClick={onClose} title="关闭回顾">
                &times;
              </CloseButton>
            </HeaderActions>
          </Header>

          <SearchWrapper>
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </SearchWrapper>

          <ScrollableContent>
            {timelineGroups.length === 0 ? (
              <EmptyState>
                <EmptyIcon src={METEOR_ICON_URL} alt="" />
                <EmptyText>微光待启</EmptyText>
                <EmptySubtext>
                  划选页面文字，或按 <kbd>Ctrl+Shift+G</kbd> 记录你的第一个理解瞬间。
                </EmptySubtext>
              </EmptyState>
            ) : (
              <TimelineList>
                {timelineGroups.map((group) => (
                  <TimelineGroupSection key={group.dateLabel}>
                    <GroupHeader>
                      <GroupLine />
                      <GroupDateLabel>{group.dateLabel}</GroupDateLabel>
                      <GroupLine />
                    </GroupHeader>
                    <GleamList>
                      {group.gleams.map((gleam) => (
                        <GleamCard
                          key={gleam.id}
                          gleam={gleam}
                          selected={viewingGleam?.id === gleam.id}
                          tagCounts={tagCounts}
                          onRevisit={onRevisitGleam}
                          onClick={handleCardClick}
                        />
                      ))}
                    </GleamList>
                  </TimelineGroupSection>
                ))}
              </TimelineList>
            )}
          </ScrollableContent>
        </ListColumn>

        <DetailColumn>
          {viewingGleam ? (
            <>
              <DetailHeader>
                <BackButton onClick={onCloseDetail} title="返回列表">
                  <svg viewBox="0 0 24 24">
                    <path d="M20,11V13H8L13.5,18.5L12,20L4,12L12,4L13.5,5.5L8,11H20Z" />
                  </svg>
                </BackButton>
                <HeaderTags>
                  {sortedTags.map((tag) => (
                    <HeaderTagChip
                      key={tag}
                      onClick={() => onRemoveTag(viewingGleam.id, tag)}
                      title={`${tag} · 用于 ${countMap.get(tag) ?? 0} 条拾光 · 点击移除`}
                    >
                      {tag}
                      <HeaderTagRemove aria-hidden>&times;</HeaderTagRemove>
                    </HeaderTagChip>
                  ))}
                </HeaderTags>
                <DetailTime>{formatReviewTime(viewingGleam.created_at)}</DetailTime>
                <DetailActions>
                  {viewingGleam.revisit_count && viewingGleam.revisit_count > 0 ? (
                    <RevisitBadge title={`回顾次数: ${viewingGleam.revisit_count}`}>
                      👁 {viewingGleam.revisit_count}
                    </RevisitBadge>
                  ) : null}
                  <DetailCloseButton onClick={onCloseDetail} title="关闭详情">
                    &times;
                  </DetailCloseButton>
                </DetailActions>
              </DetailHeader>

              <DetailContent>
                <ThoughtText>
                  <MarkdownPreview content={viewingGleam.thought} />
                </ThoughtText>

                {viewingGleam.source.excerpt && (
                  <SourceExcerpt>" {viewingGleam.source.excerpt} "</SourceExcerpt>
                )}

                {viewingGleam.source.media && <MediaPreview media={viewingGleam.source.media} />}

                {viewingGleam.source.url && (
                  <SourceFooter>
                    <SourceIcon viewBox="0 0 24 24">
                      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
                    </SourceIcon>
                    <LinkAnchor
                      href={viewingGleam.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={viewingGleam.source.url}
                    >
                      {viewingGleam.source.title ||
                        getSourceHost(viewingGleam.source.url) ||
                        '原始页面'}
                    </LinkAnchor>
                    <SourceHost>{getSourceHost(viewingGleam.source.url)}</SourceHost>
                  </SourceFooter>
                )}

                <TagEditor
                  tags={viewingGleam.tags ?? []}
                  tagCounts={tagCounts}
                  onAdd={(tag) => onAddTag(viewingGleam.id, tag)}
                />
              </DetailContent>
            </>
          ) : (
            <DetailPlaceholder>
              <PlaceholderIcon src={METEOR_ICON_URL} alt="" />
              <PlaceholderText>选择微光，细细品味</PlaceholderText>
            </DetailPlaceholder>
          )}
        </DetailColumn>
      </Layout>
    </Overlay>
  )
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(60, 55, 45, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: stretch;
  z-index: 2147483646;
  font-family: ${theme.typography.fontFamily};
  animation: fadeIn 0.25s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

const Layout = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
  background: ${theme.colors.bg.base};
  overflow: hidden;
  animation: fadeIn 0.25s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

const ListColumn = styled.div`
  width: 360px;
  flex-shrink: 0;
  height: 100vh;
  background: ${theme.colors.bg.base};
  border-right: 1px solid ${theme.colors.border.light};
  box-shadow: ${theme.shadows.card};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const DetailColumn = styled.div`
  flex: 1;
  height: 100vh;
  background: ${theme.colors.bg.input};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid ${theme.colors.border.light};
  flex-shrink: 0;
`

const HeaderTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${theme.colors.text.primary};
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
`

const GleamIcon = styled.img`
  width: 16px;
  height: 16px;
  filter: drop-shadow(0 0 3px ${theme.colors.brand.primary});
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const AddButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: ${theme.animations.transition};

  svg {
    width: 18px;
    height: 18px;
    fill: ${theme.colors.text.muted};
  }

  &:hover svg {
    fill: ${theme.colors.brand.primary};
  }
`

const ExportButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: ${theme.animations.transition};

  svg {
    width: 18px;
    height: 18px;
    fill: ${theme.colors.text.muted};
  }

  &:hover svg {
    fill: ${theme.colors.text.primary};
  }
`

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.text.muted};
  font-size: 24px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.primary};
  }
`

const SearchWrapper = styled.div`
  padding: 14px 24px;
  border-bottom: 1px solid rgba(200, 180, 140, 0.15);
  flex-shrink: 0;
`

const ScrollableContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 60%;
  padding: 20px;
`

const EmptyIcon = styled.img`
  width: 40px;
  height: 40px;
  opacity: 0.25;
  margin-bottom: 16px;
`

const EmptyText = styled.h3`
  margin: 0 0 8px 0;
  font-size: 15px;
  font-weight: 500;
  color: ${theme.colors.text.secondary};
`

const EmptySubtext = styled.p`
  margin: 0;
  font-size: 12.5px;
  color: ${theme.colors.text.muted};
  line-height: 1.6;

  kbd {
    background: rgba(200, 180, 140, 0.15);
    border: 1px solid rgba(200, 180, 140, 0.25);
    border-radius: 4px;
    padding: 2px 4px;
    font-size: 11px;
    color: ${theme.colors.text.secondary};
  }
`

const TimelineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

const TimelineGroupSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const GroupLine = styled.div`
  flex: 1;
  height: 1px;
  background: rgba(200, 180, 140, 0.2);
`

const GroupDateLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: ${theme.colors.text.muted};
`

const GleamList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`

const DetailPlaceholder = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 16px;
  padding: 24px;
  color: ${theme.colors.text.muted};
`

const PlaceholderIcon = styled.img`
  width: 44px;
  height: 44px;
  opacity: 0.25;
`

const PlaceholderText = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${theme.colors.text.muted};
  line-height: 1.6;
`

const DetailCloseButton = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.text.muted};
  font-size: 24px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.primary};
  }
`

const DetailHeader = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid ${theme.colors.border.light};
  flex-shrink: 0;
`

const BackButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: ${theme.animations.transition};

  svg {
    width: 20px;
    height: 20px;
    fill: ${theme.colors.text.muted};
  }

  &:hover svg {
    fill: ${theme.colors.text.primary};
  }
`

const DetailTime = styled.span`
  font-size: 12px;
  color: ${theme.colors.text.muted};
  font-weight: 500;
  flex-shrink: 0;
`

const HeaderTags = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  flex-wrap: nowrap;
  padding: 0 12px;
`

const HeaderTagChip = styled.span`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(200, 180, 140, 0.15);
  border: 1px solid ${theme.colors.border.light};
  border-radius: 10px;
  padding: 1px 6px 1px 8px;
  font-size: 11px;
  color: ${theme.colors.text.secondary};
  white-space: nowrap;
  cursor: pointer;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.accent};
    border-color: ${theme.colors.border.focus};
  }
`

const HeaderTagRemove = styled.span`
  font-size: 12px;
  line-height: 1;
  opacity: 0.6;
`

const DetailActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
`

const RevisitBadge = styled.span`
  font-size: 11px;
  background: rgba(200, 180, 140, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  color: ${theme.colors.text.muted};
`

const DetailContent = styled.div`
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const ThoughtText = styled.div`
  font-size: 15px;
  line-height: 1.7;
  color: ${theme.colors.text.primary};
`

const SourceExcerpt = styled.blockquote`
  margin: 0;
  padding: 12px 16px;
  background: rgba(200, 180, 140, 0.08);
  border-left: 3px solid ${theme.colors.brand.primary};
  border-radius: 0 8px 8px 0;
  font-size: 13.5px;
  color: ${theme.colors.text.secondary};
  line-height: 1.5;
  font-style: italic;
`

const SourceFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 1px solid rgba(200, 180, 140, 0.15);
  padding-top: 12px;
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
  max-width: 320px;
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
