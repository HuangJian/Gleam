import { describe, test, expect, vi, afterEach } from 'bun:test'
import { render, fireEvent, cleanup } from '@testing-library/preact'
import { RelationList } from '../ui/components/RelationList'
import { makeRelation } from './helpers'

describe('RelationList', () => {
  afterEach(cleanup)

  test('renders nothing when relations list is empty', () => {
    const { container } = render(<RelationList relations={[]} onRelationClick={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  test('renders relation items with thought text', () => {
    const rel = makeRelation({
      targetGleam: {
        id: 'g2',
        thought: 'A related thought here.',
        createdAt: '2026-07-14T12:00:00.000Z',
      },
    })
    const { getByText } = render(<RelationList relations={[rel]} onRelationClick={vi.fn()} />)
    expect(getByText('相关拾光')).toBeTruthy()
    expect(getByText('A related thought here.')).toBeTruthy()
  })

  test('shows strength percentage for AI-origin relations', () => {
    const rel = makeRelation({ strength: 0.87, origin: 'ai' })
    const { getByText } = render(<RelationList relations={[rel]} onRelationClick={vi.fn()} />)
    expect(getByText('87%')).toBeTruthy()
  })

  test('hides strength for user-origin relations', () => {
    const rel = makeRelation({ strength: null, origin: 'user' })
    const { container } = render(<RelationList relations={[rel]} onRelationClick={vi.fn()} />)
    expect(container.textContent).not.toContain('%')
  })

  test('click calls onRelationClick with target ID', () => {
    const rel = makeRelation({
      targetGleam: { id: 'target-42', thought: 'Click me.', createdAt: '2026-07-14T12:00:00.000Z' },
    })
    const onClick = vi.fn()
    const { getByText } = render(<RelationList relations={[rel]} onRelationClick={onClick} />)
    fireEvent.click(getByText('Click me.').closest('button')!)
    expect(onClick).toHaveBeenCalledWith('target-42')
  })

  test('truncates long thought text', () => {
    const longThought = 'A'.repeat(100)
    const rel = makeRelation({
      targetGleam: { id: 'g2', thought: longThought, createdAt: '2026-07-14T12:00:00.000Z' },
    })
    const { container } = render(<RelationList relations={[rel]} onRelationClick={vi.fn()} />)
    // Should be truncated to ~60 chars + ellipsis
    expect(container.textContent).toContain('…')
    expect(container.textContent!.length).toBeLessThan(longThought.length + 100)
  })
})
