import { describe, test, expect, vi, afterEach } from 'bun:test'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact'
import { ReviewRoom } from '../ui/components/ReviewRoom'
import { TimelineGroup } from '../services/timeline'
import { TagCount } from '../services/tag'
import { makeGleamWithIntelligence, makeRelation } from './helpers'
import type { GleamRelation } from '../domain/intelligence'

const mockSyncState = {
  status: 'disconnected' as const,
  pendingCount: 0,
  lastSyncAt: null,
  error: null,
}

function minimalProps(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    timelineGroups: [] as TimelineGroup[],
    onRevisitGleam: vi.fn().mockResolvedValue(undefined),
    onSearch: vi.fn(),
    onExport: vi.fn(),
    onAddGleam: vi.fn(),
    viewingGleam: null,
    onOpenGleam: vi.fn(),
    onGetRelations: vi.fn().mockResolvedValue([]) as (gleamId: string) => Promise<GleamRelation[]>,
    onRegenerateArtifact: vi.fn().mockResolvedValue(undefined),
    tagCounts: [] as TagCount[],
    onAddTag: vi.fn().mockResolvedValue(undefined),
    onRemoveTag: vi.fn().mockResolvedValue(undefined),
    syncState: mockSyncState,
    highlights: {} as Record<string, string | null>,
    onOpenSettings: vi.fn(),
    ...overrides,
  }
}

describe('ReviewRoom', () => {
  afterEach(cleanup)

  test('renders nothing when isOpen is false', () => {
    const { container } = render(<ReviewRoom {...minimalProps({ isOpen: false })} />)
    expect(container.innerHTML).toBe('')
  })

  test('renders the empty state when there are no timeline groups', () => {
    const { getByText } = render(<ReviewRoom {...minimalProps()} />)
    expect(getByText('微光待启')).toBeTruthy()
  })

  test('shows query examples when a custom query matches nothing', async () => {
    const onSearch = vi.fn()
    const { getByPlaceholderText, getByText } = render(
      <ReviewRoom {...minimalProps({ onSearch })} />,
    )
    // Type a custom query that yields no results.
    fireEvent.input(
      getByPlaceholderText(
        '搜索：关键字 / tag:react / domain:github.com / type:book / after:2026-01-01 ...',
      ),
      { target: { value: 'zzz-nomatch' } },
    )
    await waitFor(() => expect(getByText('没有匹配的微光，试试这些查询：')).toBeTruthy())
    expect(getByText('#family')).toBeTruthy()
    expect(getByText('标签为 family 的微光')).toBeTruthy()
  })

  test('shows the empty state (not examples) for a preset range with no results', () => {
    // Default range is a preset (近三天), so an empty timeline shows EmptyState
    // rather than query examples (those are reserved for custom queries).
    const { getByText, queryByText } = render(
      <ReviewRoom {...minimalProps({ timelineGroups: [] })} />,
    )
    expect(getByText('微光待启')).toBeTruthy()
    expect(queryByText('没有匹配的微光，试试这些查询：')).toBeNull()
  })

  test('renders timeline groups with gleam cards', () => {
    const groups: TimelineGroup[] = [
      {
        dateLabel: 'Today',
        gleams: [
          makeGleamWithIntelligence({ id: 'g1', thought: 'First insight.' }),
          makeGleamWithIntelligence({ id: 'g2', thought: 'Second insight.' }),
        ],
      },
    ]
    const { getByText } = render(<ReviewRoom {...minimalProps({ timelineGroups: groups })} />)
    expect(getByText('Today')).toBeTruthy()
    expect(getByText('First insight.')).toBeTruthy()
    expect(getByText('Second insight.')).toBeTruthy()
  })

  test('calls onSearch with the default range query on mount', async () => {
    const onSearch = vi.fn()
    render(<ReviewRoom {...minimalProps({ onSearch })} />)
    // Default range is 近三天 → a >=YYYYMMDD query is applied on mount.
    await waitFor(() => expect(onSearch).toHaveBeenCalled())
    const firstArg = onSearch.mock.calls[0][0] as string
    expect(firstArg.startsWith('>=')).toBe(true)
  })

  test('calls onSearch when the search input changes', async () => {
    const onSearch = vi.fn()
    const { getByPlaceholderText } = render(<ReviewRoom {...minimalProps({ onSearch })} />)
    fireEvent.input(
      getByPlaceholderText(
        '搜索：关键字 / tag:react / domain:github.com / type:book / after:2026-01-01 ...',
      ),
      {
        target: { value: 'react' },
      },
    )
    // The internal useEffect calls onSearch after each state change.
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('react'))
  })

  test('switching the range dropdown fills the search box with a time query', async () => {
    const onSearch = vi.fn()
    const { getByTitle } = render(<ReviewRoom {...minimalProps({ onSearch })} />)
    fireEvent.change(getByTitle('按时间范围筛选'), { target: { value: '本周' } })
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('>=this-week'))
  })

  test('manual input switches the range dropdown to 自定义', async () => {
    const onSearch = vi.fn()
    const { getByPlaceholderText, getByTitle } = render(
      <ReviewRoom {...minimalProps({ onSearch })} />,
    )
    fireEvent.input(
      getByPlaceholderText(
        '搜索：关键字 / tag:react / domain:github.com / type:book / after:2026-01-01 ...',
      ),
      { target: { value: 'react' } },
    )
    await waitFor(() =>
      expect((getByTitle('按时间范围筛选') as HTMLSelectElement).value).toBe('自定义'),
    )
  })

  test('calls onAddGleam when the add button is clicked', () => {
    const onAddGleam = vi.fn()
    const { getByTitle } = render(<ReviewRoom {...minimalProps({ onAddGleam })} />)
    fireEvent.click(getByTitle('添加拾光 (无来源)'))
    expect(onAddGleam).toHaveBeenCalledTimes(1)
  })

  test('calls onExport when the export button is clicked', () => {
    const onExport = vi.fn()
    const { getByTitle } = render(<ReviewRoom {...minimalProps({ onExport })} />)
    fireEvent.click(getByTitle('导出所有拾光记录 (JSON)'))
    expect(onExport).toHaveBeenCalledTimes(1)
  })

  test('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    const { getByTitle } = render(<ReviewRoom {...minimalProps({ onClose })} />)
    fireEvent.click(getByTitle('关闭回顾'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('clicking a gleam card calls onOpenGleam only (no double-count revisit)', () => {
    const item = makeGleamWithIntelligence({ id: 'card-42', thought: 'Clickable.' })
    const groups: TimelineGroup[] = [{ dateLabel: 'Today', gleams: [item] }]
    const onOpenGleam = vi.fn()
    const onRevisitGleam = vi.fn().mockResolvedValue(undefined)
    const { getByText } = render(
      <ReviewRoom {...minimalProps({ timelineGroups: groups, onOpenGleam, onRevisitGleam })} />,
    )
    fireEvent.click(getByText('Clickable.'))
    // handleCardClick should call onOpenGleam with the GleamWithIntelligence item
    expect(onOpenGleam).toHaveBeenCalledWith(item)
    // onRevisitGleam is called exactly once — by GleamCard's internal onRevisit handler,
    // NOT by handleCardClick. This prevents the double-count bug (old code called it twice).
    expect(onRevisitGleam).toHaveBeenCalledTimes(1)
    expect(onRevisitGleam).toHaveBeenCalledWith('card-42')
  })

  test('shows the detail view when viewingGleam is set', () => {
    const item = makeGleamWithIntelligence({
      thought: 'Deep thought.',
      source: {
        type: 'url',
        url: 'https://example.com',
        title: 'Source Page',
        excerpt: 'Context quote.',
      },
    })
    const { getByText } = render(<ReviewRoom {...minimalProps({ viewingGleam: item })} />)
    // Thought is rendered via MarkdownPreview in the detail card.
    expect(getByText('Deep thought.')).toBeTruthy()
    // Source link is still shown in the detail view (only the card hides it).
    expect(getByText('Source Page')).toBeTruthy()
  })

  test('renders the tag editor with existing tags when a gleam is selected', () => {
    const item = makeGleamWithIntelligence({ thought: 'Tagged.', tags: ['react', 'hooks'] })
    const groups: TimelineGroup[] = [{ dateLabel: 'Today', gleams: [item] }]
    const { getAllByText } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: item, timelineGroups: groups })} />,
    )
    expect(getAllByText('react').length).toBeGreaterThan(0)
    expect(getAllByText('hooks').length).toBeGreaterThan(0)
  })

  test('calls onAddTag when a new tag is typed and submitted', async () => {
    const item = makeGleamWithIntelligence({ thought: 'Tagged.', tags: ['react'] })
    const onAddTag = vi.fn().mockResolvedValue(undefined)
    const { getByPlaceholderText, getByTitle } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: item, onAddTag })} />,
    )
    const input = getByPlaceholderText('+ 标签')
    fireEvent.input(input, { target: { value: 'css' } })
    fireEvent.click(getByTitle('添加标签'))
    await waitFor(() => expect(onAddTag).toHaveBeenCalledWith('gleam-001', 'css'))
  })

  test('calls onRemoveTag when a header tag chip is clicked', () => {
    const item = makeGleamWithIntelligence({ thought: 'Tagged.', tags: ['react', 'hooks'] })
    const groups: TimelineGroup[] = [{ dateLabel: 'Today', gleams: [item] }]
    const onRemoveTag = vi.fn().mockResolvedValue(undefined)
    const { getAllByText } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: item, timelineGroups: groups, onRemoveTag })} />,
    )
    // The detail header chip is the one wired to onRemoveTag; click it.
    const chips = getAllByText('react')
    fireEvent.click(chips[chips.length - 1])
    expect(onRemoveTag).toHaveBeenCalledWith('gleam-001', 'react')
  })

  test('shows tag counts in suggestions for tags not on the gleam', async () => {
    const item = makeGleamWithIntelligence({ thought: 'Tagged.', tags: ['react'] })
    const tagCounts: TagCount[] = [
      { tag: 'hooks', count: 4 },
      { tag: 'css', count: 2 },
    ]
    const { getByPlaceholderText, getAllByText } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: item, tagCounts })} />,
    )
    // Typing a draft that matches a tag not present in the hot row (css) shows
    // it as an inline suggestion chip with its usage count.
    fireEvent.input(getByPlaceholderText('+ 标签'), { target: { value: 'cs' } })
    const cssNodes = getAllByText('css')
    expect(cssNodes.length).toBeGreaterThan(0)
    // The suggestion chip carries the count; assert at least one "2" exists.
    expect(getAllByText('2').length).toBeGreaterThan(0)
  })

  test('shows hot tags in the bottom row, clickable to add', () => {
    const item = makeGleamWithIntelligence({ thought: 'Tagged.', tags: ['react'] })
    const tagCounts: TagCount[] = [
      { tag: 'react', count: 5 },
      { tag: 'hooks', count: 2 },
    ]
    const onAddTag = vi.fn().mockResolvedValue(undefined)
    const { getByText } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: item, tagCounts, onAddTag })} />,
    )
    // Bottom row hot tag chip is rendered with its usage count.
    const chip = getByText('hooks')
    expect(chip).toBeTruthy()
    expect(getByText('2')).toBeTruthy()
    fireEvent.click(chip)
    expect(onAddTag).toHaveBeenCalledWith('gleam-001', 'hooks')
  })

  // ── AI Summary Section ──

  test('shows AI summary section when viewingGleam has intelligence.summary', () => {
    const item = makeGleamWithIntelligence(
      { thought: 'React is great.' },
      { summary: 'Hooks let function components manage state.' },
    )
    const { getByText } = render(<ReviewRoom {...minimalProps({ viewingGleam: item })} />)
    expect(getByText('AI 观察')).toBeTruthy()
    expect(getByText('Hooks let function components manage state.')).toBeTruthy()
  })

  test('does not show AI summary section when intelligence.summary is null', () => {
    const item = makeGleamWithIntelligence({ thought: 'No summary.' }, { summary: null })
    const { queryByText } = render(<ReviewRoom {...minimalProps({ viewingGleam: item })} />)
    expect(queryByText('AI 观察')).toBeNull()
  })

  // ── Relations Section ──

  test('shows relations section when relations are fetched', async () => {
    const item = makeGleamWithIntelligence({ id: 'g1', thought: 'Main thought.' })
    const rel = makeRelation({
      targetGleam: {
        id: 'g2',
        thought: 'Related thought here.',
        createdAt: '2026-07-14T12:00:00.000Z',
      },
    })
    const onGetRelations = vi.fn().mockResolvedValue([rel])
    const { getByText } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: item, onGetRelations })} />,
    )
    await waitFor(() => expect(getByText('相关拾光')).toBeTruthy())
    expect(getByText('Related thought here.')).toBeTruthy()
  })

  test('hides relations section when no relations exist', async () => {
    const item = makeGleamWithIntelligence({ id: 'g1', thought: 'No relations.' })
    const onGetRelations = vi.fn().mockResolvedValue([])
    const { queryByText } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: item, onGetRelations })} />,
    )
    await waitFor(() => expect(queryByText('相关拾光')).toBeNull())
  })

  test('hides relations section on fetch error', async () => {
    const item = makeGleamWithIntelligence({ id: 'g1', thought: 'Error case.' })
    const onGetRelations = vi.fn().mockRejectedValue(new Error('Server down'))
    const { queryByText } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: item, onGetRelations })} />,
    )
    await waitFor(() => expect(queryByText('相关拾光')).toBeNull())
  })

  test('clicking a relation navigates via onOpenGleam (no revisit)', async () => {
    const target = makeGleamWithIntelligence({ id: 'g2', thought: 'Viewing this gleam.' })
    const groups: TimelineGroup[] = [{ dateLabel: 'Today', gleams: [target] }]
    const rel = makeRelation({
      targetGleam: {
        id: 'g2',
        thought: 'Viewing this gleam.',
        createdAt: '2026-07-14T12:00:00.000Z',
      },
    })
    const onGetRelations = vi.fn().mockResolvedValue([rel])
    const onOpenGleam = vi.fn()
    const onRevisitGleam = vi.fn().mockResolvedValue(undefined)
    const { getByText } = render(
      <ReviewRoom
        {...minimalProps({
          viewingGleam: target,
          timelineGroups: groups,
          onGetRelations,
          onOpenGleam,
          onRevisitGleam,
        })}
      />,
    )
    await waitFor(() => expect(getByText('相关拾光')).toBeTruthy())
    // Click the relation item button — go up from the section header to the
    // section container, then find the first button (RelationItem).
    const relationHeader = getByText('相关拾光')
    const sectionContainer = relationHeader.parentElement
    const relationButton = sectionContainer?.querySelector('button')
    expect(relationButton).toBeTruthy()
    fireEvent.click(relationButton!)
    expect(onOpenGleam).toHaveBeenCalled()
    // Should NOT call onRevisitGleam — relation navigation is discovery, not revisit
    expect(onRevisitGleam).not.toHaveBeenCalled()
  })

  // ── Regeneration Controls ──

  test('shows regeneration button next to AI summary section', () => {
    const item = makeGleamWithIntelligence(
      { thought: 'Summarized.' },
      { summary: 'AI summary text.' },
    )
    const { getByTitle } = render(<ReviewRoom {...minimalProps({ viewingGleam: item })} />)
    expect(getByTitle('重新生成摘要')).toBeTruthy()
  })

  test('clicking regenerate button calls onRegenerateArtifact', async () => {
    const item = makeGleamWithIntelligence(
      { thought: 'Summarized.' },
      { summary: 'AI summary text.' },
    )
    const onRegenerateArtifact = vi.fn().mockResolvedValue(undefined)
    const { getByTitle } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: item, onRegenerateArtifact })} />,
    )
    fireEvent.click(getByTitle('重新生成摘要'))
    await waitFor(() => expect(onRegenerateArtifact).toHaveBeenCalledWith('gleam-001', 'SUMMARY'))
  })

  test('shows "已请求" after requesting regeneration', async () => {
    const item = makeGleamWithIntelligence(
      { thought: 'Summarized.' },
      { summary: 'AI summary text.' },
    )
    const onRegenerateArtifact = vi.fn().mockResolvedValue(undefined)
    const { getByText, getByTitle } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: item, onRegenerateArtifact })} />,
    )
    fireEvent.click(getByTitle('重新生成摘要'))
    await waitFor(() => expect(getByText('已请求')).toBeTruthy())
  })
})
