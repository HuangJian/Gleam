import { useEffect, useState } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'

interface SearchBarProps {
  /** The committed (searched) query — SearchBar syncs its input to this when it changes externally. */
  value: string
  /** Fired on every keystroke. Updates local input only; does NOT trigger a search. */
  onChange: (value: string) => void
  /** Fired on Enter (or Clear). Commits the query and triggers a search. */
  onSubmit: (value: string) => void
  /** Number of gleams matched by the current query, shown in the hint after a search. */
  matchCount?: number | null
}

/** Curated example queries shown when a search yields nothing. Keep in sync
 *  with doc/query-language.md and the grammar in monkey/src/services/query.ts. */
export const EXAMPLE_QUERIES: { query: string; label: string }[] = [
  { query: 'react', label: '查找任何包含「react」的微光' },
  { query: '#family', label: '标签为 family 的微光' },
  { query: 'domain:github.com', label: '来源来自 github.com 的微光' },
  { query: 'type:book', label: '来源类型为「书」的微光' },
  { query: '>=20260101 && <=20260630', label: '2026 年上半年的微光' },
  { query: '#react OR #frontend', label: '标签为 react 或 frontend 的微光' },
  { query: '-type:book', label: '排除来源为「书」的微光' },
  { query: '>=this-month', label: '本月以来的微光' },
  { query: 'in:2026', label: '2026 年全年的微光' },
  { query: '~2026Q3', label: '2026 年第三季度的微光' },
]

export function SearchBar({ value, onChange, onSubmit, matchCount }: SearchBarProps) {
  // The input keeps its own draft so typing never reaches the backend. The
  // `value` prop only overwrites the draft when it changes externally — i.e.
  // when a range preset fills the box or a search commits.
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraft(value)
    setDirty(false)
  }, [value])

  const handleInput = (e: Event) => {
    const next = (e.target as HTMLInputElement).value
    setDraft(next)
    setDirty(true)
    onChange(next)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    // Don't let global shortcuts fire while typing in the search box.
    e.stopPropagation()
    if (e.key !== 'Enter') return
    setDirty(false)
    onSubmit(draft)
  }

  const handleClear = () => {
    setDraft('')
    setDirty(false)
    // Clearing is a deliberate action → submit an empty query immediately.
    onSubmit('')
  }

  const hint = dirty ? '按回车检索' : matchCount != null ? `匹配 ${matchCount} 条` : ''

  return (
    <SearchContainer>
      <SearchIcon viewBox="0 0 24 24">
        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" />
      </SearchIcon>
      <StyledInput
        type="text"
        placeholder="搜索：关键字 / tag:react / domain:github.com / type:book / after:2026-01-01 ..."
        value={draft}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
      />

      {hint && <HintLabel $dirty={dirty}>{hint}</HintLabel>}

      {draft && (
        <ClearButton onClick={handleClear} title="清除搜索">
          &times;
        </ClearButton>
      )}
    </SearchContainer>
  )
}

const SearchContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  background: ${theme.colors.bg.input};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 8px;
  padding: 8px 12px;
  gap: 8px;
  transition: ${theme.animations.transition};

  &:focus-within {
    border-color: ${theme.colors.border.focus};
    box-shadow: 0 0 10px ${theme.colors.brand.glow};
  }
`

const SearchIcon = styled.svg`
  width: 16px;
  height: 16px;
  fill: ${theme.colors.text.muted};
  flex-shrink: 0;
`

const StyledInput = styled.input`
  background: none;
  border: none;
  outline: none;
  color: ${theme.colors.text.primary};
  font-family: inherit;
  font-size: 13px;
  width: 100%;
  padding: 0;

  &::placeholder {
    color: ${theme.colors.text.muted};
  }
`

const HintLabel = styled.span<{ $dirty: boolean }>`
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
  color: ${(p) => (p.$dirty ? theme.colors.text.accent : theme.colors.text.muted)};
  opacity: ${(p) => (p.$dirty ? 0.9 : 0.7)};
`

const ClearButton = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.text.muted};
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.primary};
  }
`
