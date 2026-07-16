import { useState } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'
import { TagCount } from '../../services/tag'

interface TagEditorProps {
  tags: string[]
  tagCounts: TagCount[]
  onAdd: (tag: string) => void
}

export function TagEditor({ tags, tagCounts, onAdd }: TagEditorProps) {
  const [draft, setDraft] = useState('')
  const [composing, setComposing] = useState(false)

  const draftLower = draft.trim().toLowerCase()
  const suggestions = tagCounts
    .filter(
      (tc) =>
        !tags.includes(tc.tag) && (draftLower === '' || tc.tag.toLowerCase().includes(draftLower)),
    )
    .slice(0, 8)
  const hotTags = tagCounts.slice(0, 8)

  const commitAdd = () => {
    const value = draft.trim()
    if (!value) return
    onAdd(value)
    setDraft('')
  }

  return (
    <Wrapper>
      <TagRow>
        <HotHint>热门标签 -</HotHint>
        {hotTags.map((tc) => (
          <HotChip
            key={tc.tag}
            onClick={() => onAdd(tc.tag)}
            title={`${tc.tag} · 用于 ${tc.count} 条拾光`}
          >
            {tc.tag}
            <HotCount>{tc.count}</HotCount>
          </HotChip>
        ))}

        <AddInput
          value={draft}
          placeholder="+ 标签"
          onInput={(e: Event) => setDraft((e.target as HTMLInputElement).value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(e: KeyboardEvent) => {
            e.stopPropagation()
            // Ignore Enter while an IME composition is active (e.g. confirming
            // Chinese pinyin candidates) so it doesn't create a tag prematurely.
            if (
              e.key === 'Enter' &&
              !composing &&
              !(e as KeyboardEvent & { isComposing?: boolean }).isComposing
            ) {
              commitAdd()
            }
          }}
        />
        <AddButton onClick={commitAdd} disabled={!draft.trim()} title="添加标签">
          +
        </AddButton>
      </TagRow>

      {draft.trim() !== '' && suggestions.length > 0 && (
        <Suggestions>
          {suggestions.map((tc) => (
            <SuggestionChip
              key={tc.tag}
              onClick={() => {
                onAdd(tc.tag)
                setDraft('')
              }}
              title={`${tc.tag} · 用于 ${tc.count} 条拾光`}
            >
              {tc.tag}
              <Count>{tc.count}</Count>
            </SuggestionChip>
          ))}
        </Suggestions>
      )}
    </Wrapper>
  )
}

const Wrapper = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const TagRow = styled.div`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  overflow: hidden;
`

const Suggestions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  background: ${theme.colors.bg.card};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 8px;
  padding: 6px;
  box-shadow: ${theme.shadows.popover};
`

const HotHint = styled.span`
  font-size: 11px;
  color: ${theme.colors.text.muted};
  flex-shrink: 0;
`

const HotChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(200, 180, 140, 0.1);
  border: 1px dashed ${theme.colors.border.light};
  border-radius: 12px;
  padding: 2px 8px 2px 10px;
  font-size: 12px;
  font-weight: 500;
  color: ${theme.colors.text.secondary};
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.accent};
    border-color: ${theme.colors.border.focus};
  }
`

const HotCount = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: ${theme.colors.text.accent};
  background: rgba(218, 165, 80, 0.18);
  border-radius: 10px;
  padding: 0 6px;
  line-height: 16px;
`

const AddInput = styled.input`
  flex: 1 1 90px;
  min-width: 80px;
  background: ${theme.colors.bg.input};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  color: ${theme.colors.text.primary};
  font-family: inherit;
  outline: none;
  transition: ${theme.animations.transition};

  &:focus {
    border-color: ${theme.colors.border.focus};
    box-shadow: 0 0 8px ${theme.colors.brand.glow};
  }

  &::placeholder {
    color: ${theme.colors.text.muted};
  }
`

const AddButton = styled.button`
  background: ${theme.colors.brand.primary};
  border: none;
  border-radius: 8px;
  width: 26px;
  height: 26px;
  color: hsl(45, 40%, 97%);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition: ${theme.animations.spring};

  &:hover:not(:disabled) {
    background: ${theme.colors.brand.primaryHover};
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const SuggestionChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: ${theme.colors.bg.card};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 12px;
  color: ${theme.colors.text.secondary};
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.accent};
    border-color: ${theme.colors.border.focus};
  }
`

const Count = styled.span`
  font-size: 10px;
  color: ${theme.colors.text.muted};
  background: rgba(200, 180, 140, 0.15);
  border-radius: 10px;
  padding: 1px 6px;
`
