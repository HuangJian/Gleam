import { useEffect, useState, useRef } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'
import { METEOR_ICON_URL } from '../assets'

interface CapturePanelProps {
  excerpt?: string
  initialThought?: string
  readOnly?: boolean
  onSave?: (thought: string) => Promise<void>
  onClose: () => void
}

export function CapturePanel({
  excerpt,
  initialThought = '',
  readOnly = false,
  onSave,
  onClose,
}: CapturePanelProps) {
  const [thought, setThought] = useState(initialThought)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!readOnly) {
      textareaRef.current?.focus()
    }

    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const handleSave = async () => {
    if (readOnly) return
    if (!thought.trim()) {
      setError('理解内容不能为空')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      await onSave?.(thought)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  // Only support CMD+Enter / CTRL+Enter to save in non-readOnly mode
  const handleKeyDown = (e: KeyboardEvent) => {
    if (readOnly) return
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Overlay onClick={readOnly ? onClose : undefined}>
      <PanelCard onClick={(e: MouseEvent) => e.stopPropagation()}>
        <Header>
          <TitleArea>
            <GleamIcon src={METEOR_ICON_URL} alt="" />
            <Title>微光拾起，沉淀于岁月后，将再次闪耀智慧光芒</Title>
          </TitleArea>
          <HeaderActions>
            {!readOnly && (
              <>
                <CancelButton onClick={onClose} disabled={isSaving}>
                  取消
                </CancelButton>
                <SaveButton onClick={handleSave} disabled={isSaving || !thought.trim()}>
                  {isSaving ? '保存中...' : '拾取'}
                </SaveButton>
              </>
            )}
            {readOnly && <CloseButton onClick={onClose}>&times;</CloseButton>}
          </HeaderActions>
        </Header>

        <Content>
          <InputSection>
            <SectionLabel>此刻的理解 (Thought)</SectionLabel>
            <StyledTextarea
              ref={textareaRef}
              placeholder={
                readOnly ? '' : '写下你此刻真实的理解：感想、总结、类比、疑问、进展、猜测、直觉、……'
              }
              value={thought}
              onInput={(e: any) => setThought((e.target as HTMLTextAreaElement).value)}
              onKeyDown={handleKeyDown}
              disabled={isSaving || readOnly}
              readOnly={readOnly}
            />
          </InputSection>

          {excerpt && (
            <ExcerptSection>
              <SectionLabel>触发语境 (Excerpt)</SectionLabel>
              <ExcerptText>“ {excerpt} ”</ExcerptText>
            </ExcerptSection>
          )}

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </Content>
      </PanelCard>
    </Overlay>
  )
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(60, 55, 45, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2147483647;
  animation: fadeIn 0.25s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

const PanelCard = styled.div`
  width: 80%;
  max-width: 80vw;
  height: 80%;
  max-height: 80vh;
  background: ${theme.colors.bg.glass};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 16px;
  box-shadow: ${theme.shadows.card};
  overflow: hidden;
  font-family: ${theme.typography.fontFamily};
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 24px;
  border-bottom: 1px solid ${theme.colors.border.light};
  flex-shrink: 0;
`

const TitleArea = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
`

const GleamIcon = styled.img`
  width: 18px;
  height: 18px;
  filter: drop-shadow(0 0 4px ${theme.colors.brand.primary});
  flex-shrink: 0;
`

const Title = styled.h2`
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: ${theme.colors.text.primary};
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
`

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.text.muted};
  font-size: 24px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.primary};
  }
`

const Content = styled.div`
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  overflow-y: auto;
`

const ExcerptSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
`

const SectionLabel = styled.span`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: ${theme.colors.text.muted};
  font-weight: 600;
`

const ExcerptText = styled.blockquote`
  margin: 0;
  padding: 12px 16px;
  background: rgba(200, 180, 140, 0.08);
  border-left: 3px solid ${theme.colors.brand.primary};
  border-radius: 0 8px 8px 0;
  font-size: 13.5px;
  color: ${theme.colors.text.secondary};
  line-height: 1.5;
  font-style: italic;
  max-height: 100px;
  overflow-y: auto;
`

const InputSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
`

const StyledTextarea = styled.textarea`
  width: 100%;
  flex: 1;
  min-height: 120px;
  background: ${theme.colors.bg.input};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 10px;
  padding: 14px;
  color: ${theme.colors.text.primary};
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
  box-sizing: border-box;
  transition: ${theme.animations.transition};

  &:focus {
    border-color: ${theme.colors.border.focus};
    box-shadow: 0 0 10px ${theme.colors.brand.glow};
  }

  &:read-only {
    background: rgba(200, 180, 140, 0.04);
    cursor: default;
  }
`

const ErrorMessage = styled.div`
  color: hsl(0, 85%, 65%);
  font-size: 12px;
  flex-shrink: 0;
`

const CancelButton = styled.button`
  background: none;
  border: 1px solid ${theme.colors.border.light};
  border-radius: 8px;
  padding: 6px 14px;
  color: ${theme.colors.text.secondary};
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: ${theme.animations.transition};

  &:hover {
    background: rgba(200, 180, 140, 0.15);
    color: ${theme.colors.text.primary};
  }
`

const SaveButton = styled.button`
  background: ${theme.colors.brand.primary};
  border: none;
  border-radius: 8px;
  padding: 6px 16px;
  color: hsl(45, 40%, 97%);
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  box-shadow: ${theme.shadows.glow};
  transition: ${theme.animations.spring};

  &:hover:not(:disabled) {
    background: ${theme.colors.brand.primaryHover};
    transform: translateY(-1px);
    box-shadow: 0 4px 15px rgba(180, 140, 80, 0.4);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
`
