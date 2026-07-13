import { useState, useEffect } from 'preact/hooks'
import styled from '@emotion/styled'
import { TimelineGroup } from '../../services/timeline'
import { GleamCard } from './GleamCard'
import { SearchBar } from './SearchBar'
import { theme } from '../theme'
import { METEOR_ICON_URL } from '../assets'

interface ReviewSidebarProps {
  isOpen: boolean
  onClose: () => void
  timelineGroups: TimelineGroup[]
  onDeleteGleam: (id: string) => Promise<void>
  onRevisitGleam: (id: string) => Promise<void>
  onSearch: (query: string) => void
  onExport: () => void
}

export function ReviewSidebar({
  isOpen,
  onClose,
  timelineGroups,
  onDeleteGleam,
  onRevisitGleam,
  onSearch,
  onExport,
}: ReviewSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    onSearch(searchQuery)
  }, [searchQuery])

  if (!isOpen) return null

  return (
    <SidebarContainer>
      <SidebarHeader>
        <HeaderTitle>
          <GleamIcon src={METEOR_ICON_URL} alt="" />
          <span>拾光志 · 认知演化</span>
        </HeaderTitle>
        <HeaderActions>
          <ExportButton onClick={onExport} title="导出所有拾光记录 (JSON)">
            <svg viewBox="0 0 24 24">
              <path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z" />
            </svg>
          </ExportButton>
          <CloseButton onClick={onClose} title="关闭侧边栏">
            &times;
          </CloseButton>
        </HeaderActions>
      </SidebarHeader>

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
                      onDelete={onDeleteGleam}
                      onRevisit={onRevisitGleam}
                    />
                  ))}
                </GleamList>
              </TimelineGroupSection>
            ))}
          </TimelineList>
        )}
      </ScrollableContent>
    </SidebarContainer>
  )
}

const SidebarContainer = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  width: 400px;
  max-width: 100vw;
  height: 100vh;
  background: ${theme.colors.bg.glass};
  border-left: 1px solid ${theme.colors.border.light};
  box-shadow: ${theme.shadows.card};
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  font-family: ${theme.typography.fontFamily};
  animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }
`

const SidebarHeader = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid ${theme.colors.border.light};
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
  padding: 0;
  line-height: 1;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.primary};
  }
`

const SearchWrapper = styled.div`
  padding: 14px 20px;
  border-bottom: 1px solid rgba(200, 180, 140, 0.15);
`

const ScrollableContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
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
