import styled from '@emotion/styled'
import { theme } from '../theme'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <SearchContainer>
      <SearchIcon viewBox="0 0 24 24">
        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" />
      </SearchIcon>
      <StyledInput
        type="text"
        placeholder="搜索我的理解、记录与来源..."
        value={value}
        onInput={(e: any) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
      />

      {value && (
        <ClearButton onClick={() => onChange('')} title="清除搜索">
          &times;
        </ClearButton>
      )}
    </SearchContainer>
  )
}

const SearchContainer = styled.div`
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
