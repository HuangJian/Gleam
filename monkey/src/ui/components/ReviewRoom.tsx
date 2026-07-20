import { useState, useEffect } from 'preact/hooks'
import styled from '@emotion/styled'
import type { GleamWithIntelligence, GleamRelation, ArtifactType } from '../../domain/intelligence'
import { TimelineGroup } from '../../services/timeline'
import { GleamCard } from './GleamCard'
import { RelationList } from './RelationList'
import { SearchBar, EXAMPLE_QUERIES } from './SearchBar'
import { MarkdownPreview } from './MarkdownPreview'
import { MediaPreview } from './MediaPreview'
import { SourceExcerpt } from './SourceExcerpt'
import { TagEditor } from './TagEditor'
import { TagCount } from '../../services/tag'
import type { SyncState } from '../../services/sync'
import { theme } from '../theme'
import { METEOR_ICON_URL } from '../assets'
import { formatReviewTime, getSourceHost } from '../../utils/review'

const RANGE_OPTIONS = ['自定义', '今天', '本周', '近三天', '近十天', '近三十天'] as const
type RangeOption = (typeof RANGE_OPTIONS)[number]

/** 计算 n 天前的本地日期，格式 YYYYMMDD（查询语言日期字面量）。 */
function dateNDaysAgo(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** 将时间范围选项映射为 Recall 查询语句。 */
function rangeToQuery(range: string): string {
  switch (range) {
    case '今天':
      return '>=today'
    case '本周':
      return '>=this-week'
    case '近三天':
      return `>=${dateNDaysAgo(3)}`
    case '近十天':
      return `>=${dateNDaysAgo(10)}`
    case '近三十天':
      return `>=${dateNDaysAgo(30)}`
    default:
      return '' // 自定义：不强制任何时间范围
  }
}

interface ReviewRoomProps {
  isOpen: boolean
  onClose: () => void
  timelineGroups: TimelineGroup[]
  onRevisitGleam: (id: string) => Promise<void>
  onSearch: (query: string) => void
  onExport: () => void
  onAddGleam: () => void
  viewingGleam: GleamWithIntelligence | null
  onOpenGleam: (item: GleamWithIntelligence) => void
  onGetRelations: (gleamId: string) => Promise<GleamRelation[]>
  onRegenerateArtifact: (gleamId: string, artifact: ArtifactType) => Promise<void>
  tagCounts: TagCount[]
  onAddTag: (gleamId: string, tag: string) => Promise<void>
  onRemoveTag: (gleamId: string, tag: string) => Promise<void>
  syncState: SyncState
  highlights: Record<string, string | null>
  onOpenSettings: () => void
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
  onGetRelations,
  onRegenerateArtifact,
  tagCounts,
  onAddTag,
  onRemoveTag,
  syncState,
  highlights,
  onOpenSettings,
}: ReviewRoomProps) {
  const [range, setRange] = useState<RangeOption>('近三天')
  const [searchQuery, setSearchQuery] = useState(() => rangeToQuery('近三天'))
  const [relations, setRelations] = useState<GleamRelation[]>([])
  const [regenerating, setRegenerating] = useState<ArtifactType | null>(null)

  // A custom query (typed by the user) that matched nothing → show examples.
  // Preset ranges that match nothing still show the generic empty state.
  const showQueryExamples =
    range === '自定义' && searchQuery.trim() !== '' && timelineGroups.length === 0

  useEffect(() => {
    onSearch(searchQuery)
  }, [searchQuery])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    // 用户手动输入 → 视为自定义范围，不再套用预设时间筛选
    setRange('自定义')
  }

  const handleRangeChange = (value: string) => {
    setRange(value as RangeOption)
    // 自定义：保留用户当前输入；其余选项填入对应时间查询
    setSearchQuery(value === '自定义' ? '' : rangeToQuery(value))
  }

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Fetch relations when viewingGleam changes
  useEffect(() => {
    if (!viewingGleam) {
      setRelations([])
      return
    }
    // Switching Gleams resets both relations and the optimistic
    // regeneration state — a "已请求" badge from a previous Gleam
    // must not persist onto the newly opened one.
    setRegenerating(null)
    let cancelled = false
    onGetRelations(viewingGleam.gleam.id)
      .then((rels) => {
        if (!cancelled) setRelations(rels)
      })
      .catch(() => {
        if (!cancelled) setRelations([])
      })
    return () => {
      cancelled = true
    }
  }, [viewingGleam?.gleam.id])

  const handleRegenerate = async (artifact: ArtifactType) => {
    if (!viewingGleam) return
    setRegenerating(artifact)
    await onRegenerateArtifact(viewingGleam.gleam.id, artifact)
  }

  if (!isOpen) return null

  const countMap = new Map(tagCounts.map((tc) => [tc.tag, tc.count]))
  const sortedTags = viewingGleam
    ? viewingGleam.gleam.tags
        .slice()
        .sort((a, b) => (countMap.get(b) ?? 0) - (countMap.get(a) ?? 0))
    : []

  // handleCardClick — ONLY opens the detail view.
  // Revisit counting is handled by GleamCard's own `onRevisit` prop (above),
  // which fires inside GleamCard.handleCardClick. Calling onRevisitGleam here
  // too would double-count the revisit (+2). This also fixes a pre-existing
  // bug in the current ReviewRoom where handleCardClick called onRevisitGleam
  // AND GleamCard's onRevisit both fired.
  const handleCardClick = (item: GleamWithIntelligence) => {
    onOpenGleam(item)
  }

  const handleRelationClick = (targetId: string) => {
    // Both ends of a relation are in the same repository, so the target
    // is already in the timeline. Look it up from loaded data.
    const found = timelineGroups.flatMap((g) => g.gleams).find((item) => item.gleam.id === targetId)
    if (found) {
      onOpenGleam(found)
      // NOTE: deliberately does NOT call onRevisitGleam — relation
      // navigation is discovery, not a "revisit" of the user's own gleam.
    }
    // If not found (edge case: target filtered out of current time range),
    // the click is a no-op. A future enhancement could fetch it individually.
  }

  const summary = viewingGleam?.intelligence.summary ?? null
  const aiTagSet = new Set(viewingGleam?.intelligence.aiTags ?? [])

  return (
    <Overlay data-testid="review-room">
      <Layout>
        <Header>
          <HeaderTitle>
            <GleamIcon src={METEOR_ICON_URL} alt="" />
            <span>拾光 · 认知演化的轨迹</span>
            <SyncIndicator onClick={onOpenSettings} title="同步状态与设置">
              <SyncDot $status={syncState.status} />
              {syncState.pendingCount > 0 && <PendingBadge>{syncState.pendingCount}</PendingBadge>}
            </SyncIndicator>
          </HeaderTitle>
          <HeaderMiddle>
            <RangeSelect
              value={range}
              onChange={(e: Event) => handleRangeChange((e.target as HTMLSelectElement).value)}
              title="按时间范围筛选"
            >
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </RangeSelect>
            <SearchWrapper>
              <SearchBar value={searchQuery} onChange={handleSearchChange} />
            </SearchWrapper>
          </HeaderMiddle>
          <HeaderRight>
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
          </HeaderRight>
        </Header>

        <Body>
          <ListColumn>
            <ScrollableContent>
              {timelineGroups.length === 0 ? (
                showQueryExamples ? (
                  <QueryExamples>
                    <ExamplesHint>没有匹配的微光，试试这些查询：</ExamplesHint>
                    <ExamplesList>
                      {EXAMPLE_QUERIES.map((ex) => (
                        <ExampleItem
                          key={ex.query}
                          type="button"
                          onClick={() => setSearchQuery(ex.query)}
                          title={`填入查询：${ex.query}`}
                        >
                          <ExampleQuery>{ex.query}</ExampleQuery>
                          <ExampleLabel>
                            {'    '}
                            {ex.label}
                          </ExampleLabel>
                        </ExampleItem>
                      ))}
                    </ExamplesList>
                  </QueryExamples>
                ) : (
                  <EmptyState>
                    <EmptyIcon src={METEOR_ICON_URL} alt="" />
                    <EmptyText>微光待启</EmptyText>
                    <EmptySubtext>
                      划选页面文字，或按 <kbd>Ctrl+Shift+G</kbd> 记录你的第一个理解瞬间。
                    </EmptySubtext>
                  </EmptyState>
                )
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
                        {group.gleams.map((item) => (
                          <GleamCard
                            key={item.gleam.id}
                            gleam={item.gleam}
                            intelligence={item.intelligence}
                            onRevisit={onRevisitGleam}
                            onClick={() => handleCardClick(item)}
                            selected={viewingGleam?.gleam.id === item.gleam.id}
                            tagCounts={tagCounts}
                            highlight={highlights[item.gleam.id] ?? null}
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
                  <HeaderTags>
                    {sortedTags.map((tag) => (
                      <HeaderTagChip
                        key={tag}
                        $ai={aiTagSet.has(tag)}
                        onClick={() => onRemoveTag(viewingGleam.gleam.id, tag)}
                        title={`${tag} · 用于 ${countMap.get(tag) ?? 0} 条拾光 · 点击移除`}
                      >
                        {aiTagSet.has(tag) && <span>✦</span>}
                        {tag}
                        <HeaderTagRemove aria-hidden>&times;</HeaderTagRemove>
                      </HeaderTagChip>
                    ))}
                  </HeaderTags>
                  <DetailTime>{formatReviewTime(viewingGleam.gleam.createdAt)}</DetailTime>
                  <DetailActions>
                    {viewingGleam.gleam.revisitCount > 0 ? (
                      <RevisitBadge title={`回顾次数: ${viewingGleam.gleam.revisitCount}`}>
                        👁 {viewingGleam.gleam.revisitCount}
                      </RevisitBadge>
                    ) : null}
                  </DetailActions>
                </DetailHeader>

                <DetailContent>
                  <ThoughtText>
                    <MarkdownPreview content={viewingGleam.gleam.thought} />
                  </ThoughtText>

                  {summary && (
                    <AIObservationSection>
                      <AIObservationHeader>
                        <AIObservationLabel>AI 观察</AIObservationLabel>
                        <RegenerateButton
                          onClick={() => handleRegenerate('SUMMARY')}
                          title="重新生成摘要"
                          disabled={regenerating === 'SUMMARY'}
                        >
                          {regenerating === 'SUMMARY' ? '已请求' : '↻'}
                        </RegenerateButton>
                      </AIObservationHeader>
                      <AISummaryText>
                        <AIPrefix>✦</AIPrefix>
                        {summary}
                      </AISummaryText>
                    </AIObservationSection>
                  )}

                  {viewingGleam.gleam.source.excerpt && (
                    <SourceExcerpt text={viewingGleam.gleam.source.excerpt} />
                  )}

                  {viewingGleam.gleam.source.media && (
                    <MediaPreview media={viewingGleam.gleam.source.media} />
                  )}

                  {viewingGleam.gleam.source.url && (
                    <SourceFooter>
                      <SourceIcon viewBox="0 0 24 24">
                        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
                      </SourceIcon>
                      <LinkAnchor
                        href={viewingGleam.gleam.source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={viewingGleam.gleam.source.url}
                      >
                        {viewingGleam.gleam.source.title ||
                          getSourceHost(viewingGleam.gleam.source.url) ||
                          '原始页面'}
                      </LinkAnchor>
                      <SourceHost>{getSourceHost(viewingGleam.gleam.source.url)}</SourceHost>
                    </SourceFooter>
                  )}

                  <RelationList relations={relations} onRelationClick={handleRelationClick} />

                  <TagEditor
                    tags={viewingGleam.gleam.tags}
                    tagCounts={tagCounts}
                    aiTags={viewingGleam.intelligence.aiTags}
                    onAdd={(tag) => onAddTag(viewingGleam.gleam.id, tag)}
                    onRemove={(tag) => onRemoveTag(viewingGleam.gleam.id, tag)}
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
        </Body>
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
  flex-direction: column;
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
  width: 540px;
  flex-shrink: 0;
  height: 100%;
  background: ${theme.colors.bg.base};
  border-right: 1px solid ${theme.colors.border.light};
  box-shadow: ${theme.shadows.card};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const DetailColumn = styled.div`
  flex: 1;
  height: 100%;
  background: ${theme.colors.bg.input};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid ${theme.colors.border.light};
  flex-shrink: 0;
`

const HeaderMiddle = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  margin: 0 12px;
`

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`

const Body = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`

const RangeSelect = styled.select`
  flex-shrink: 0;
  background: ${theme.colors.bg.input};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: ${theme.colors.text.secondary};
  font-family: inherit;
  outline: none;
  cursor: pointer;
  transition: ${theme.animations.transition};

  &:focus {
    border-color: ${theme.colors.border.focus};
    box-shadow: 0 0 10px ${theme.colors.brand.glow};
  }
`

const HeaderTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  color: ${theme.colors.text.primary};
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.3px;
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

const SyncIndicator = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  position: relative;
  transition: ${theme.animations.transition};

  &:hover {
    opacity: 0.7;
  }
`

const SyncDot = styled.span<{ $status: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(p) =>
    p.$status === 'connected'
      ? theme.colors.text.success
      : p.$status === 'syncing'
        ? theme.colors.text.warning
        : theme.colors.text.error};
  flex-shrink: 0;
  ${(p) => p.$status === 'syncing' && `animation: pulse 1s ease-in-out infinite;`}

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }
`

const PendingBadge = styled.span`
  font-size: 10px;
  font-weight: 600;
  background: ${theme.colors.text.warning};
  color: white;
  border-radius: 8px;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
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
  flex: 1 1 auto;
  min-width: 240px;
  max-width: 720px;
`

const ScrollableContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 50%;
  padding: 16px;
`

const EmptyIcon = styled.img`
  width: 40px;
  height: 40px;
  opacity: 0.25;
  margin-bottom: 12px;
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
  line-height: 1.5;

  kbd {
    background: rgba(200, 180, 140, 0.15);
    border: 1px solid rgba(200, 180, 140, 0.25);
    border-radius: 4px;
    padding: 2px 4px;
    font-size: 11px;
    color: ${theme.colors.text.secondary};
  }
`

const QueryExamples = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 2px;
`

const ExamplesHint = styled.div`
  font-size: 12px;
  color: ${theme.colors.text.muted};
`

const ExamplesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`

const ExampleItem = styled.button`
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  padding: 5px 6px;
  cursor: pointer;
  transition: ${theme.animations.transition};

  &:hover {
    background: ${theme.colors.reference.bg};
  }
`

const ExampleQuery = styled.code`
  flex-shrink: 0;
  font-family: ${theme.typography.fontFamily};
  font-size: 12px;
  color: ${theme.colors.brand.primary};
  background: ${theme.colors.reference.bg};
  border: 1px solid ${theme.colors.reference.border};
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
`

const ExampleLabel = styled.span`
  font-size: 12px;
  color: ${theme.colors.text.secondary};
  padding-left: 4px;
  white-space: pre;
`

const TimelineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const TimelineGroupSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
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
  gap: 10px;
`

const DetailPlaceholder = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  padding: 16px;
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
  line-height: 1.5;
`

const DetailHeader = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid ${theme.colors.border.light};
  flex-shrink: 0;
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
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  flex-wrap: nowrap;
  padding: 0 8px;
`

const HeaderTagChip = styled.span<{ $ai: boolean }>`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: ${(p) => (p.$ai ? theme.colors.intelligence.tagBg : 'rgba(200, 180, 140, 0.15)')};
  border: 1px ${(p) => (p.$ai ? 'dashed' : 'solid')}
    ${(p) => (p.$ai ? theme.colors.intelligence.tagBorder : theme.colors.border.light)};
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
  gap: 8px;
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
  padding: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const ThoughtText = styled.div`
  font-size: 15px;
  line-height: 1.6;
  color: ${theme.colors.text.primary};
`

const AIObservationSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
  border-top: 1px solid ${theme.colors.border.card};
  border-bottom: 1px solid ${theme.colors.border.card};
`

const AIObservationHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const AIObservationLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: ${theme.colors.intelligence.accent};
`

const RegenerateButton = styled.button`
  background: none;
  border: 1px solid ${theme.colors.border.light};
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  color: ${theme.colors.text.muted};
  cursor: pointer;
  font-family: inherit;
  transition: ${theme.animations.transition};

  &:hover:not(:disabled) {
    color: ${theme.colors.intelligence.accent};
    border-color: ${theme.colors.intelligence.accent};
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`

const AISummaryText = styled.div`
  display: flex;
  gap: 4px;
  font-size: 13px;
  line-height: 1.5;
  color: ${theme.colors.intelligence.summaryText};
  font-style: italic;
`

const AIPrefix = styled.span`
  color: ${theme.colors.intelligence.accent};
  flex-shrink: 0;
`

const SourceFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  border-top: 1px solid rgba(200, 180, 140, 0.15);
  padding-top: 8px;
  margin-top: 2px;
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
