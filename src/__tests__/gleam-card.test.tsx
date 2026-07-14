import { describe, test, expect, vi, afterEach } from 'bun:test'
import { render, fireEvent, cleanup } from '@testing-library/preact'
import { GleamCard } from '../ui/components/GleamCard'
import { makeGleam } from './helpers'

describe('GleamCard', () => {
  afterEach(cleanup)

  test('renders the thought text', () => {
    const gleam = makeGleam({ thought: 'Pattern matching is powerful.' })
    const { getByText } = render(<GleamCard gleam={gleam} onRevisit={() => {}} />)
    // MarkdownPreview wraps plain text in <p>, so getByText should find it.
    expect(getByText('Pattern matching is powerful.')).toBeTruthy()
  })

  test('shows the excerpt when present', () => {
    const gleam = makeGleam({
      thought: 'Good quote.',
      source: { type: 'url', url: 'https://x.com', excerpt: 'To be or not to be' },
    })
    const { getByText } = render(<GleamCard gleam={gleam} onRevisit={() => {}} />)
    expect(getByText(/To be or not to be/)).toBeTruthy()
  })

  test('does not render an excerpt block when absent', () => {
    const gleam = makeGleam({ thought: 'Plain thought.' })
    const { container } = render(<GleamCard gleam={gleam} onRevisit={() => {}} />)
    // The excerpt is rendered in a <blockquote> — none should exist.
    expect(container.querySelector('blockquote')).toBeNull()
  })

  test('shows the source link when a URL is present', () => {
    const gleam = makeGleam({
      thought: 'From an article.',
      source: { type: 'url', url: 'https://example.com/post', title: 'My Post' },
    })
    const { getByText } = render(<GleamCard gleam={gleam} onRevisit={() => {}} />)
    const link = getByText('My Post')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('https://example.com/post')
  })

  test('shows a revisit badge when revisit_count > 0', () => {
    const gleam = makeGleam({ revisit_count: 3 })
    const { getByText } = render(<GleamCard gleam={gleam} onRevisit={() => {}} />)
    expect(getByText(/3/)).toBeTruthy()
  })

  test('does not show a revisit badge when revisit_count is 0', () => {
    const gleam = makeGleam({ revisit_count: 0 })
    const { queryByText } = render(<GleamCard gleam={gleam} onRevisit={() => {}} />)
    // The badge text is "👁 {count}" — only appears for count > 0.
    expect(queryByText('👁')).toBeNull()
  })

  test('calls onRevisit and onClick when the card is clicked', () => {
    const onRevisit = vi.fn()
    const onClick = vi.fn()
    const gleam = makeGleam({ id: 'card-1' })
    const { getByText } = render(
      <GleamCard gleam={gleam} onRevisit={onRevisit} onClick={onClick} />,
    )
    fireEvent.click(getByText('A flash of understanding.'))
    expect(onRevisit).toHaveBeenCalledWith('card-1')
    expect(onClick).toHaveBeenCalledWith(gleam)
  })
})
