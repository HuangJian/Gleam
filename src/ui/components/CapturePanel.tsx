import { useEffect, useState, useRef } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'
import { METEOR_ICON_URL } from '../assets'
import { MarkdownPreview } from './MarkdownPreview'

interface CapturePanelProps {
  excerpt?: string
  initialThought?: string
  readOnly?: boolean
  createdAt?: string
  onSave?: (thought: string) => Promise<void>
  onClose: () => void
}

function formatThoughtLabel(isoString: string): string {
  const d = new Date(isoString)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute} 的理解 (Thought)`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Build the HTML for the indent-visibility overlay. Only the leading whitespace
 * of each line is replaced with a visible gold dot (rendered over a real space
 * so the rest of the text stays pixel-aligned with the textarea). The remaining
 * text is escaped and rendered as-is.
 */
function buildIndentOverlayHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const lead = line.match(/^ */)?.[0].length ?? 0
      const dots = line
        .slice(0, lead)
        .split('')
        .map(() => '<span class="indent-dot"> <span class="dot">·</span></span>')
        .join('')
      return dots + escapeHtml(line.slice(lead))
    })
    .join('\n')
}

export function CapturePanel({
  excerpt,
  initialThought = '',
  readOnly = false,
  createdAt,
  onSave,
  onClose,
}: CapturePanelProps) {
  const [thought, setThought] = useState(initialThought)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [showIndent, setShowIndent] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!readOnly && mode === 'write') {
      textareaRef.current?.focus()
    }
  }, [mode, readOnly])

  useEffect(() => {
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

  // Stop keydown from propagating to host page (e.g. GitHub shortcuts)
  // while preserving Cmd/Ctrl+Enter to save
  const handleKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
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
            {readOnly ? (
              <>
                <SectionLabel>
                  {createdAt ? `${formatThoughtLabel(createdAt)}` : '此刻的理解 (Thought)'}
                </SectionLabel>
                <ReadOnlyContent>
                  {thought.trim() ? (
                    <MarkdownPreview content={thought} />
                  ) : (
                    <EmptyHint>（无内容）</EmptyHint>
                  )}
                </ReadOnlyContent>
              </>
            ) : (
              <>
                <EditorToolbar>
                  <TabGroup>
                    <TabButton $active={mode === 'write'} onClick={() => setMode('write')}>
                      Write
                    </TabButton>
                    <TabButton $active={mode === 'preview'} onClick={() => setMode('preview')}>
                      Preview
                    </TabButton>
                  </TabGroup>
                  <IndentToggle
                    type="button"
                    $active={showIndent}
                    onClick={() => setShowIndent((v) => !v)}
                    title="显示行首缩进（用于软换行续行）"
                    aria-pressed={showIndent}
                  >
                    <input type="checkbox" checked={showIndent} readOnly tabIndex={-1} />␣ 缩进
                  </IndentToggle>
                </EditorToolbar>
                {mode === 'write' ? (
                  <EditorWrap>
                    <StyledTextarea
                      ref={textareaRef}
                      $ghost={showIndent}
                      placeholder="写下你此刻真实的理解：感想、总结、类比、疑问、进展、猜测、直觉、…… 支持 Markdown 格式"
                      value={thought}
                      onInput={(e: any) => setThought((e.target as HTMLTextAreaElement).value)}
                      onKeyDown={handleKeyDown}
                      disabled={isSaving}
                    />
                    {showIndent && (
                      <IndentOverlay
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: buildIndentOverlayHtml(thought) }}
                      />
                    )}
                  </EditorWrap>
                ) : (
                  <PreviewArea>
                    {thought.trim() ? (
                      <MarkdownPreview content={thought} />
                    ) : (
                      <EmptyHint>暂无内容可预览</EmptyHint>
                    )}
                  </PreviewArea>
                )}
              </>
            )}
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
  background: ${theme.colors.bg.base};
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
  overscroll-behavior: contain;
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

const EditorToolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
`

const TabGroup = styled.div`
  display: flex;
  gap: 2px;
  background: rgba(200, 180, 140, 0.1);
  padding: 2px;
  border-radius: 8px;
`

const TabButton = styled.button<{ $active: boolean }>`
  background: ${(p) => (p.$active ? theme.colors.bg.card : 'transparent')};
  border: none;
  border-radius: 6px;
  padding: 4px 14px;
  color: ${(p) => (p.$active ? theme.colors.text.primary : theme.colors.text.muted)};
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.primary};
  }
`

const IndentToggle = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: ${(p) => (p.$active ? theme.colors.brand.glow : 'transparent')};
  border: 1px solid ${(p) => (p.$active ? theme.colors.border.focus : theme.colors.border.light)};
  border-radius: 6px;
  padding: 4px 10px;
  color: ${(p) => (p.$active ? theme.colors.text.accent : theme.colors.text.muted)};
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.accent};
    border-color: ${theme.colors.border.focus};
  }

  input[type='checkbox'] {
    margin: 0;
    width: 12px;
    height: 12px;
    accent-color: ${theme.colors.brand.primary};
    cursor: pointer;
    pointer-events: none;
  }
`

const EditorWrap = styled.div`
  position: relative;
  flex: 1;
  min-height: 120px;
`

const IndentOverlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  width: 100%;
  height: 100%;
  background: ${theme.colors.bg.input};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 10px;
  padding: 14px;
  color: ${theme.colors.text.primary};
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  box-sizing: border-box;
  z-index: 1;

  .indent-dot {
    position: relative;
    color: transparent;
  }

  .dot {
    position: absolute;
    left: 0;
    top: 0;
    color: ${theme.colors.brand.primary};
    opacity: 0.7;
  }
`

const StyledTextarea = styled.textarea<{ $ghost?: boolean }>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: ${(p) => (p.$ghost ? 'transparent' : theme.colors.bg.input)};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 10px;
  padding: 14px;
  color: ${(p) => (p.$ghost ? 'transparent' : theme.colors.text.primary)};
  caret-color: ${theme.colors.text.primary};
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
  box-sizing: border-box;
  transition: ${theme.animations.transition};
  z-index: 2;

  &:focus {
    border-color: ${theme.colors.border.focus};
    box-shadow: 0 0 10px ${theme.colors.brand.glow};
  }
`

const PreviewArea = styled.div`
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: ${theme.colors.bg.input};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 10px;
  padding: 14px;
  box-sizing: border-box;
`

const ReadOnlyContent = styled.div`
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: rgba(200, 180, 140, 0.04);
  border: 1px solid ${theme.colors.border.light};
  border-radius: 10px;
  padding: 14px;
  box-sizing: border-box;
`

const EmptyHint = styled.div`
  color: ${theme.colors.text.muted};
  font-size: 13px;
  font-style: italic;
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
