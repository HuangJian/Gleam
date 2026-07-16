import styled from '@emotion/styled'
import { theme } from '../theme'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  /** Whether the current query matched at least one gleam. When false and the
   *  query is non-empty, we show clickable example queries. */
  hasResults?: boolean
}

/** Curated example queries shown when a search yields nothing. Keep in sync
 *  with doc/query-language.md and the grammar in src/services/query.ts. */
const EXAMPLE_QUERIES: { query: string; label: string }[] = [
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

export function SearchBar({ value, onChange, hasResults = true }: SearchBarProps) {
  const showExamples = value.trim() !== '' && !hasResults

  return (
    <SearchContainer>
      <SearchIcon viewBox="0 0 24 24">
        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" />
      </SearchIcon>
      <StyledInput
        type="text"
        placeholder="搜索：关键字 / tag:react / domain:github.com / type:book / after:2026-01-01 ..."
        value={value}
        onInput={(e: any) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
      />

      {value && (
        <ClearButton onClick={() => onChange('')} title="清除搜索">
          &times;
        </ClearButton>
      )}

      {showExamples && (
        <ExamplesPanel>
          <ExamplesHint>没有匹配的微光，试试这些查询：</ExamplesHint>
          <ExamplesList>
            {EXAMPLE_QUERIES.map((ex) => (
              <ExampleItem
                key={ex.query}
                type="button"
                onClick={() => onChange(ex.query)}
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
        </ExamplesPanel>
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

const ExamplesPanel = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  background: ${theme.colors.bg.card};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 10px;
  box-shadow: ${theme.shadows.popover};
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const ExamplesHint = styled.div`
  font-size: 12px;
  color: ${theme.colors.text.muted};
`

const ExamplesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const ExampleItem = styled.button`
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  padding: 6px 8px;
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
