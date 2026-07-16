import { describe, test, expect, vi, afterEach } from 'bun:test'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact'
import { ReviewRoom } from '../ui/components/ReviewRoom'
import { TimelineGroup } from '../services/timeline'
import { TagCount } from '../services/tag'
import { makeGleam } from './helpers'

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
    onCloseDetail: vi.fn(),
    tagCounts: [] as TagCount[],
    onAddTag: vi.fn().mockResolvedValue(undefined),
    onRemoveTag: vi.fn().mockResolvedValue(undefined),
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

  test('renders timeline groups with gleam cards', () => {
    const groups: TimelineGroup[] = [
      {
        dateLabel: 'Today',
        gleams: [
          makeGleam({ id: 'g1', thought: 'First insight.' }),
          makeGleam({ id: 'g2', thought: 'Second insight.' }),
        ],
      },
    ]
    const { getByText } = render(<ReviewRoom {...minimalProps({ timelineGroups: groups })} />)
    expect(getByText('Today')).toBeTruthy()
    expect(getByText('First insight.')).toBeTruthy()
    expect(getByText('Second insight.')).toBeTruthy()
  })

  test('calls onSearch when the search input changes', async () => {
    const onSearch = vi.fn()
    const { getByPlaceholderText } = render(<ReviewRoom {...minimalProps({ onSearch })} />)
    fireEvent.input(getByPlaceholderText('搜索我的理解、记录与来源...'), {
      target: { value: 'react' },
    })
    // The internal useEffect calls onSearch after each state change.
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('react'))
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

  test('clicking a gleam card calls onOpenGleam and onRevisitGleam', () => {
    const gleam = makeGleam({ id: 'card-42', thought: 'Clickable.' })
    const groups: TimelineGroup[] = [{ dateLabel: 'Today', gleams: [gleam] }]
    const onOpenGleam = vi.fn()
    const onRevisitGleam = vi.fn().mockResolvedValue(undefined)
    const { getByText } = render(
      <ReviewRoom {...minimalProps({ timelineGroups: groups, onOpenGleam, onRevisitGleam })} />,
    )
    fireEvent.click(getByText('Clickable.'))
    expect(onOpenGleam).toHaveBeenCalledWith(gleam)
    expect(onRevisitGleam).toHaveBeenCalledWith('card-42')
  })

  test('shows the detail overlay when viewingGleam is set', () => {
    const gleam = makeGleam({
      thought: 'Deep thought.',
      source: {
        type: 'url',
        url: 'https://example.com',
        title: 'Source Page',
        excerpt: 'Context quote.',
      },
    })
    const { getByText, getByTitle } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: gleam })} />,
    )
    // Thought is rendered via MarkdownPreview in the detail card.
    expect(getByText('Deep thought.')).toBeTruthy()
    // Back button.
    expect(getByTitle('返回列表')).toBeTruthy()
    // Source link shows the title text.
    expect(getByText('Source Page')).toBeTruthy()
  })

  test('calls onCloseDetail when the back button in the detail view is clicked', () => {
    const gleam = makeGleam({ thought: 'Detail.' })
    const onCloseDetail = vi.fn()
    const { getByTitle } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: gleam, onCloseDetail })} />,
    )
    fireEvent.click(getByTitle('返回列表'))
    expect(onCloseDetail).toHaveBeenCalledTimes(1)
  })

  test('calls onCloseDetail when the detail close button is clicked', () => {
    const gleam = makeGleam({ thought: 'Backdrop test.' })
    const onCloseDetail = vi.fn()
    const { getByTitle } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: gleam, onCloseDetail })} />,
    )
    // The detail now renders inline in the right column; the close button
    // (titled "关闭详情") calls onCloseDetail.
    fireEvent.click(getByTitle('关闭详情'))
    expect(onCloseDetail).toHaveBeenCalledTimes(1)
  })

  test('renders the tag editor with existing tags when a gleam is selected', () => {
    const gleam = makeGleam({ thought: 'Tagged.', tags: ['react', 'hooks'] })
    const { getByText } = render(<ReviewRoom {...minimalProps({ viewingGleam: gleam })} />)
    expect(getByText('react')).toBeTruthy()
    expect(getByText('hooks')).toBeTruthy()
  })

  test('calls onAddTag when a new tag is typed and submitted', async () => {
    const gleam = makeGleam({ thought: 'Tagged.', tags: ['react'] })
    const onAddTag = vi.fn().mockResolvedValue(undefined)
    const { getByPlaceholderText, getByTitle } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: gleam, onAddTag })} />,
    )
    const input = getByPlaceholderText('+ 标签')
    fireEvent.input(input, { target: { value: 'css' } })
    fireEvent.click(getByTitle('添加标签'))
    await waitFor(() => expect(onAddTag).toHaveBeenCalledWith('gleam-001', 'css'))
  })

  test('calls onRemoveTag when a header tag chip is clicked', () => {
    const gleam = makeGleam({ thought: 'Tagged.', tags: ['react', 'hooks'] })
    const onRemoveTag = vi.fn().mockResolvedValue(undefined)
    const { getByText } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: gleam, onRemoveTag })} />,
    )
    fireEvent.click(getByText('react'))
    expect(onRemoveTag).toHaveBeenCalledWith('gleam-001', 'react')
  })

  test('shows tag counts in suggestions for tags not on the gleam', async () => {
    const gleam = makeGleam({ thought: 'Tagged.', tags: ['react'] })
    const tagCounts: TagCount[] = [
      { tag: 'hooks', count: 4 },
      { tag: 'css', count: 2 },
    ]
    const { getByPlaceholderText, getAllByText } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: gleam, tagCounts })} />,
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
    const gleam = makeGleam({ thought: 'Tagged.', tags: ['react'] })
    const tagCounts: TagCount[] = [
      { tag: 'react', count: 5 },
      { tag: 'hooks', count: 2 },
    ]
    const onAddTag = vi.fn().mockResolvedValue(undefined)
    const { getByText } = render(
      <ReviewRoom {...minimalProps({ viewingGleam: gleam, tagCounts, onAddTag })} />,
    )
    // Bottom row hot tag chip is rendered with its usage count.
    const chip = getByText('hooks')
    expect(chip).toBeTruthy()
    expect(getByText('2')).toBeTruthy()
    fireEvent.click(chip)
    expect(onAddTag).toHaveBeenCalledWith('gleam-001', 'hooks')
  })
})
