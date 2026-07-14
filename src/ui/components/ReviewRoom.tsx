import { useState, useEffect } from 'preact/hooks'
import styled from '@emotion/styled'
import { Gleam } from '../../domain/gleam'
import { TimelineGroup } from '../../services/timeline'
import { GleamCard } from './GleamCard'
import { SearchBar } from './SearchBar'
import { MarkdownPreview } from './MarkdownPreview'
import { MediaPreview } from './MediaPreview'
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

  const handleCardClick = (gleam: Gleam) => {
    onOpenGleam(gleam)
    void onRevisitGleam(gleam.id)
  }

  return (
    <>
      <Overlay data-testid="review-room">
        <ReadingColumn>
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
        </ReadingColumn>
      </Overlay>

      {viewingGleam && (
        <DetailOverlay onClick={onCloseDetail}>
          <DetailCard onClick={(e: MouseEvent) => e.stopPropagation()}>
            <DetailHeader>
              <BackButton onClick={onCloseDetail} title="返回列表">
                <svg viewBox="0 0 24 24">
                  <path d="M20,11V13H8L13.5,18.5L12,20L4,12L12,4L13.5,5.5L8,11H20Z" />
                </svg>
              </BackButton>
              <DetailMeta>
                <DetailTime>{formatReviewTime(viewingGleam.created_at)}</DetailTime>
                {viewingGleam.revisit_count && viewingGleam.revisit_count > 0 ? (
                  <RevisitBadge title={`回顾次数: ${viewingGleam.revisit_count}`}>
                    👁 {viewingGleam.revisit_count}
                  </RevisitBadge>
                ) : null}
              </DetailMeta>
              <CloseButton onClick={onCloseDetail} title="关闭">
                &times;
              </CloseButton>
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
            </DetailContent>
          </DetailCard>
        </DetailOverlay>
      )}
    </>
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

const ReadingColumn = styled.div`
  width: 100%;
  max-width: 720px;
  height: 100vh;
  background: ${theme.colors.bg.base};
  border-left: 1px solid ${theme.colors.border.light};
  border-right: 1px solid ${theme.colors.border.light};
  box-shadow: ${theme.shadows.card};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
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

const DetailOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(60, 55, 45, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2147483647;
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

const DetailCard = styled.div`
  width: 90%;
  max-width: 720px;
  max-height: 86vh;
  background: ${theme.colors.bg.base};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 16px;
  box-shadow: ${theme.shadows.card};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
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

const DetailMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  justify-content: center;
`

const DetailTime = styled.span`
  font-size: 12px;
  color: ${theme.colors.text.muted};
  font-weight: 500;
`

const RevisitBadge = styled.span`
  font-size: 11px;
  background: rgba(200, 180, 140, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  color: ${theme.colors.text.muted};
`

const DetailContent = styled.div`
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
