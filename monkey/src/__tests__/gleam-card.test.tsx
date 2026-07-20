import { describe, test, expect, vi, afterEach } from 'bun:test'
import { render, fireEvent, cleanup } from '@testing-library/preact'
import { GleamCard } from '../ui/components/GleamCard'
import { makeGleam, makeIntelligence } from './helpers'

describe('GleamCard', () => {
  afterEach(cleanup)

  test('renders the thought text', () => {
    const gleam = makeGleam({ thought: 'Pattern matching is powerful.' })
    const { getByText } = render(<GleamCard gleam={gleam} onRevisit={() => {}} />)
    // MarkdownPreview wraps plain text in <p>, so getByText should find it.
    expect(getByText('Pattern matching is powerful.')).toBeTruthy()
  })

  test('does not render a source excerpt block', () => {
    const gleam = makeGleam({
      thought: 'Good quote.',
      source: { type: 'url', url: 'https://x.com', title: '', excerpt: 'To be or not to be' },
    })
    const { container } = render(<GleamCard gleam={gleam} onRevisit={() => {}} />)
    // Source excerpt is intentionally hidden on the card (shown only in detail).
    expect(container.querySelector('figure')).toBeNull()
    expect(container.textContent).not.toContain('To be or not to be')
  })

  test('does not render a source link when a URL is present', () => {
    const gleam = makeGleam({
      thought: 'From an article.',
      source: { type: 'url', url: 'https://example.com/post', title: 'My Post', excerpt: '' },
    })
    const { queryByText } = render(<GleamCard gleam={gleam} onRevisit={() => {}} />)
    expect(queryByText('My Post')).toBeNull()
  })

  test('shows a revisit badge when revisitCount > 0', () => {
    const gleam = makeGleam({ revisitCount: 3 })
    const { getByText } = render(<GleamCard gleam={gleam} onRevisit={() => {}} />)
    expect(getByText(/3/)).toBeTruthy()
  })

  test('does not show a revisit badge when revisitCount is 0', () => {
    const gleam = makeGleam({ revisitCount: 0 })
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

  // ── AI Summary Display ──

  test('renders AI summary when intelligence.summary is present', () => {
    const gleam = makeGleam({ thought: 'React hooks are powerful.' })
    const intelligence = makeIntelligence({
      summary: 'Hooks let function components manage state.',
    })
    const { getByText } = render(
      <GleamCard gleam={gleam} intelligence={intelligence} onRevisit={() => {}} />,
    )
    expect(getByText('Hooks let function components manage state.')).toBeTruthy()
  })

  test('does not render AI summary when intelligence.summary is null', () => {
    const gleam = makeGleam({ thought: 'No summary here.' })
    const intelligence = makeIntelligence({ summary: null })
    const { container } = render(
      <GleamCard gleam={gleam} intelligence={intelligence} onRevisit={() => {}} />,
    )
    expect(container.textContent).not.toContain('AI:')
  })

  test('does not render AI summary when intelligence is absent', () => {
    const gleam = makeGleam({ thought: 'No intelligence prop.' })
    const { container } = render(<GleamCard gleam={gleam} onRevisit={() => {}} />)
    expect(container.textContent).not.toContain('✦')
  })

  // ── Tag Provenance ──

  test('shows ✦ indicator on AI-suggested tags', () => {
    const gleam = makeGleam({ tags: ['react', 'hooks'] })
    const intelligence = makeIntelligence({ aiTags: ['react'] })
    const { getAllByText } = render(
      <GleamCard gleam={gleam} intelligence={intelligence} onRevisit={() => {}} />,
    )
    // Only 'react' should have the ✦ prefix
    const aiPrefixes = getAllByText('✦')
    expect(aiPrefixes).toHaveLength(1)
  })

  test('does not show ✦ on user-only tags', () => {
    const gleam = makeGleam({ tags: ['react', 'hooks'] })
    const intelligence = makeIntelligence({ aiTags: [] })
    const { queryAllByText } = render(
      <GleamCard gleam={gleam} intelligence={intelligence} onRevisit={() => {}} />,
    )
    expect(queryAllByText('✦')).toHaveLength(0)
  })
})
