import { describe, test, expect, vi, afterEach } from 'bun:test'
import { render, fireEvent, cleanup } from '@testing-library/preact'
import { SearchBar } from '../ui/components/SearchBar'

const PLACEHOLDER = '搜索我的理解、记录与来源...'

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
})
