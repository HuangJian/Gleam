import { describe, test, expect, vi, afterEach } from 'bun:test'
import { render, fireEvent, cleanup } from '@testing-library/preact'
import { SearchBar } from '../ui/components/SearchBar'

const PLACEHOLDER =
  '搜索：关键字 / tag:react / domain:github.com / type:book / after:2026-01-01 ...'

describe('SearchBar', () => {
  afterEach(cleanup)

  test('renders the input with the given value and placeholder', () => {
    const { getByPlaceholderText } = render(<SearchBar value="insight" onChange={() => {}} />)
    const input = getByPlaceholderText(PLACEHOLDER) as HTMLInputElement
    expect(input.value).toBe('insight')
  })

  test('calls onChange when the user types', () => {
    const onChange = vi.fn()
    const { getByPlaceholderText } = render(<SearchBar value="" onChange={onChange} />)
    fireEvent.input(getByPlaceholderText(PLACEHOLDER), { target: { value: 'react' } })
    expect(onChange).toHaveBeenCalledWith('react')
  })

  test('shows a clear button when the value is non-empty', () => {
    const { getByTitle, queryByTitle } = render(<SearchBar value="keyword" onChange={() => {}} />)
    expect(getByTitle('清除搜索')).toBeTruthy()
    // Sanity: not showing a non-existent title
    expect(queryByTitle('nope')).toBeNull()
  })

  test('clear button calls onChange with empty string', () => {
    const onChange = vi.fn()
    const { getByTitle } = render(<SearchBar value="keyword" onChange={onChange} />)
    fireEvent.click(getByTitle('清除搜索'))
    expect(onChange).toHaveBeenCalledWith('')
  })

  test('does not show a clear button when the value is empty', () => {
    const { queryByTitle } = render(<SearchBar value="" onChange={() => {}} />)
    expect(queryByTitle('清除搜索')).toBeNull()
  })

  test('shows example queries when a non-empty query has no results', () => {
    const onChange = vi.fn()
    const { getByText, queryByText } = render(
      <SearchBar value="zzz-nomatch" onChange={onChange} hasResults={false} />,
    )
    expect(getByText('没有匹配的微光，试试这些查询：')).toBeTruthy()
    const example = getByText('#family') as HTMLElement
    expect(example).toBeTruthy()
    fireEvent.click(example)
    expect(onChange).toHaveBeenCalledWith('#family')
    expect(queryByText('标签为 family 的微光')).toBeTruthy()
  })

  test('does not show examples when there are results', () => {
    const { queryByText } = render(
      <SearchBar value="react" onChange={() => {}} hasResults={true} />,
    )
    expect(queryByText('没有匹配的微光，试试这些查询：')).toBeNull()
  })

  test('does not show examples for an empty query', () => {
    const { queryByText } = render(<SearchBar value="" onChange={() => {}} hasResults={false} />)
    expect(queryByText('没有匹配的微光，试试这些查询：')).toBeNull()
  })
})
