import { useEffect, useState, useRef } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'

interface CapturePanelProps {
  excerpt?: string
  onSave: (thought: string) => Promise<void>
  onClose: () => void
}

export function CapturePanel({ excerpt, onSave, onClose }: CapturePanelProps) {
  const [thought, setThought] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Focus textarea on mount
    textareaRef.current?.focus()

    // Prevent background scrolling
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const handleSave = async () => {
    if (!thought.trim()) {
      setError('理解内容不能为空')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      await onSave(thought)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  // Support CMD+Enter / CTRL+Enter to save
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <Overlay onClick={onClose}>
      <PanelCard onClick={(e: MouseEvent) => e.stopPropagation()}>
        <Header>
          <TitleArea>
            <GleamIcon viewBox="0 0 24 24">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </GleamIcon>
            <Title>拾起微光</Title>
          </TitleArea>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </Header>

        <Content>
          {excerpt && (
            <ExcerptSection>
              <SectionLabel>触发语境 (Excerpt)</SectionLabel>
              <ExcerptText>“ {excerpt} ”</ExcerptText>
            </ExcerptSection>
          )}

          <InputSection>
            <SectionLabel>此刻的理解 (Thought)</SectionLabel>
            <StyledTextarea
              ref={textareaRef}
              placeholder="写下你此刻真实的理解（记录直觉、类比、疑问，而不是单纯的摘录）..."
              value={thought}
              onInput={(e: any) => setThought((e.target as HTMLTextAreaElement).value)}
              onKeyDown={handleKeyDown}
              disabled={isSaving}
            />

            <Tip>提示: 按 ⌘+Enter 或 Ctrl+Enter 快速保存</Tip>
          </InputSection>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </Content>

        <Footer>
          <CancelButton onClick={onClose} disabled={isSaving}>
            取消
          </CancelButton>
          <SaveButton onClick={handleSave} disabled={isSaving || !thought.trim()}>
            {isSaving ? '保存中...' : '封存瞬时认知'}
          </SaveButton>
        </Footer>
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
  background: rgba(8, 10, 16, 0.6);
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
  width: 90%;
  max-width: 520px;
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
`

const TitleArea = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const GleamIcon = styled.svg`
  width: 18px;
  height: 18px;
  fill: ${theme.colors.text.accent};
  filter: drop-shadow(0 0 4px ${theme.colors.brand.primary});
`

const Title = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${theme.colors.text.primary};
  letter-spacing: 0.5px;
`

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.text.muted};
  font-size: 24px;
  cursor: pointer;
  padding: 0;
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
`

const ExcerptSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  background: rgba(255, 255, 255, 0.03);
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
`

const StyledTextarea = styled.textarea`
  width: 100%;
  height: 120px;
  background: ${theme.colors.bg.input};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 10px;
  padding: 14px;
  color: ${theme.colors.text.primary};
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  transition: ${theme.animations.transition};

  &:focus {
    border-color: ${theme.colors.border.focus};
    box-shadow: 0 0 10px ${theme.colors.brand.glow};
  }
`

const Tip = styled.span`
  font-size: 11px;
  color: ${theme.colors.text.muted};
  text-align: right;
`

const ErrorMessage = styled.div`
  color: hsl(0, 85%, 65%);
  font-size: 12px;
`

const Footer = styled.footer`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 18px 24px;
  background: rgba(0, 0, 0, 0.15);
  border-top: 1px solid ${theme.colors.border.light};
`

const CancelButton = styled.button`
  background: none;
  border: 1px solid ${theme.colors.border.light};
  border-radius: 8px;
  padding: 8px 16px;
  color: ${theme.colors.text.secondary};
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: ${theme.animations.transition};

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: ${theme.colors.text.primary};
  }
`

const SaveButton = styled.button`
  background: ${theme.colors.brand.primary};
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  color: hsl(224, 25%, 10%);
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  box-shadow: ${theme.shadows.glow};
  transition: ${theme.animations.spring};

  &:hover:not(:disabled) {
    background: ${theme.colors.brand.primaryHover};
    transform: translateY(-1px);
    box-shadow: 0 4px 15px rgba(253, 186, 116, 0.35);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
`
