import { describe, test, expect, vi, afterEach } from 'bun:test'
import { render, fireEvent, cleanup } from '@testing-library/preact'
import { SearchBar } from '../ui/components/SearchBar'

const PLACEHOLDER =
  '搜索：关键字 / tag:react / domain:github.com / type:book / after:2026-01-01 ...'

describe('SearchBar', () => {
  afterEach(cleanup)

  test('renders the input with the given value and placeholder', () => {
    const { getByPlaceholderText } = render(
      <SearchBar value="insight" onChange={() => {}} onSubmit={() => {}} />,
    )
    const input = getByPlaceholderText(PLACEHOLDER) as HTMLInputElement
    expect(input.value).toBe('insight')
  })

  test('calls onChange (not onSubmit) when the user types', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const { getByPlaceholderText } = render(
      <SearchBar value="" onChange={onChange} onSubmit={onSubmit} />,
    )
    fireEvent.input(getByPlaceholderText(PLACEHOLDER), { target: { value: 'react' } })
    expect(onChange).toHaveBeenCalledWith('react')
    // Typing alone must NOT trigger a search.
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('calls onSubmit when Enter is pressed', () => {
    const onSubmit = vi.fn()
    const { getByPlaceholderText } = render(
      <SearchBar value="react" onChange={() => {}} onSubmit={onSubmit} />,
    )
    fireEvent.keyDown(getByPlaceholderText(PLACEHOLDER), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('react')
  })

  test('shows the "press Enter" hint while editing', () => {
    const { getByPlaceholderText, getByText } = render(
      <SearchBar value="" onChange={() => {}} onSubmit={() => {}} />,
    )
    fireEvent.input(getByPlaceholderText(PLACEHOLDER), { target: { value: 'react' } })
    expect(getByText('按回车检索')).toBeTruthy()
  })

  test('shows the match count after a search (not dirty)', () => {
    const { getByPlaceholderText, getByText } = render(
      <SearchBar value="react" onChange={() => {}} onSubmit={() => {}} matchCount={7} />,
    )
    // Not dirty (no typing) → hint reflects the committed match count.
    expect(getByText('匹配 7 条')).toBeTruthy()
    // Sanity: no input event, so the edit hint must not be present.
    expect(getByPlaceholderText(PLACEHOLDER)).toBeTruthy()
  })

  test('shows a clear button when the value is non-empty', () => {
    const { getByTitle, queryByTitle } = render(
      <SearchBar value="keyword" onChange={() => {}} onSubmit={() => {}} />,
    )
    expect(getByTitle('清除搜索')).toBeTruthy()
    // Sanity: not showing a non-existent title
    expect(queryByTitle('nope')).toBeNull()
  })

  test('clear button calls onSubmit with empty string', () => {
    const onSubmit = vi.fn()
    const { getByTitle } = render(
      <SearchBar value="keyword" onChange={() => {}} onSubmit={onSubmit} />,
    )
    fireEvent.click(getByTitle('清除搜索'))
    expect(onSubmit).toHaveBeenCalledWith('')
  })

  test('does not show a clear button when the value is empty', () => {
    const { queryByTitle } = render(<SearchBar value="" onChange={() => {}} onSubmit={() => {}} />)
    expect(queryByTitle('清除搜索')).toBeNull()
  })

  test('does not render example queries inline (moved to the list column)', () => {
    const { queryByText } = render(
      <SearchBar value="zzz-nomatch" onChange={() => {}} onSubmit={() => {}} />,
    )
    expect(queryByText('没有匹配的微光，试试这些查询：')).toBeNull()
  })
})
