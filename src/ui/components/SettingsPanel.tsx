import { useState } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'
import type { SyncState } from '../../services/sync'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  syncState: SyncState
  serverUrl: string
  onSaveUrl: (url: string) => void
  onTestConnection: () => Promise<boolean>
  onSyncNow: () => Promise<void>
}

export function SettingsPanel({
  isOpen,
  onClose,
  syncState,
  serverUrl,
  onSaveUrl,
  onTestConnection,
  onSyncNow,
}: SettingsPanelProps) {
  const [urlInput, setUrlInput] = useState(serverUrl)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'fail'>('idle')

  if (!isOpen) return null

  const handleSave = () => {
    onSaveUrl(urlInput.trim())
  }

  const handleTest = async () => {
    onSaveUrl(urlInput.trim())
    setTesting(true)
    setTestResult('idle')
    const ok = await onTestConnection()
    setTestResult(ok ? 'success' : 'fail')
    setTesting(false)
  }

  const handleSync = async () => {
    await onSyncNow()
  }

  const statusColor =
    syncState.status === 'connected'
      ? theme.colors.text.success
      : syncState.status === 'syncing'
        ? theme.colors.text.warning
        : theme.colors.text.error

  const statusText =
    syncState.status === 'connected'
      ? '已连接'
      : syncState.status === 'syncing'
        ? '同步中…'
        : '未连接'

  return (
    <Overlay onClick={onClose}>
      <Panel onClick={(e: Event) => e.stopPropagation()}>
        <PanelHeader>
          <PanelTitle>设置</PanelTitle>
          <CloseButton onClick={onClose} title="关闭">
            &times;
          </CloseButton>
        </PanelHeader>

        <Section>
          <SectionLabel>服务端地址</SectionLabel>
          <UrlInput
            type="url"
            placeholder="http://localhost:3000/graphql"
            value={urlInput}
            onInput={(e: Event) => setUrlInput((e.target as HTMLInputElement).value)}
          />
          <ButtonRow>
            <ActionButton onClick={handleSave} title="保存地址">
              保存
            </ActionButton>
            <ActionButton
              onClick={handleTest}
              disabled={testing || !urlInput.trim()}
              title="保存并测试连接"
            >
              {testing ? '测试中…' : '测试连接'}
            </ActionButton>
          </ButtonRow>
          {testResult === 'success' && <TestResult $ok={true}>连接成功</TestResult>}
          {testResult === 'fail' && <TestResult $ok={false}>连接失败，请检查地址或网络</TestResult>}
        </Section>

        <Section>
          <SectionLabel>同步状态</SectionLabel>
          <StatusRow>
            <StatusDot $color={statusColor} />
            <StatusText>{statusText}</StatusText>
          </StatusRow>
          <InfoGrid>
            <InfoItem>
              <InfoLabel>待上传</InfoLabel>
              <InfoValue>{syncState.pendingCount} 条</InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>上次同步</InfoLabel>
              <InfoValue>
                {syncState.lastSyncAt
                  ? new Date(syncState.lastSyncAt).toLocaleString([], {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '尚未同步'}
              </InfoValue>
            </InfoItem>
          </InfoGrid>
          {syncState.error && <ErrorText>{syncState.error}</ErrorText>}
          <ActionButton
            onClick={handleSync}
            disabled={syncState.pendingCount === 0 || syncState.status === 'syncing'}
            title="立即上传待同步的拾光"
          >
            立即同步
          </ActionButton>
        </Section>

        <HelpText>
          配置服务端地址后，捕获的拾光会自动上传至服务器归档。服务端不可用时，拾光会保存在本地缓存，待恢复连接后自动同步。
        </HelpText>
      </Panel>
    </Overlay>
  )
}

// ── Styled components ──────────────────────────────────

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
  font-family: ${theme.typography.fontFamily};
  animation: fadeIn 0.2s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

const Panel = styled.div`
  background: ${theme.colors.bg.base};
  border-radius: 16px;
  box-shadow: ${theme.shadows.popover};
  width: 440px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const PanelTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  color: ${theme.colors.text.primary};
  margin: 0;
`

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  color: ${theme.colors.text.muted};
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.primary};
  }
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${theme.colors.text.secondary};
`

const UrlInput = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${theme.colors.border.light};
  border-radius: 8px;
  font-size: 14px;
  font-family: ${theme.typography.fontFamily};
  color: ${theme.colors.text.primary};
  background: ${theme.colors.bg.input};
  outline: none;
  transition: ${theme.animations.transition};
  box-sizing: border-box;

  &:focus {
    border-color: ${theme.colors.border.focus};
  }
`

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
`

const ActionButton = styled.button`
  padding: 8px 16px;
  border: 1px solid ${theme.colors.border.light};
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  font-family: ${theme.typography.fontFamily};
  color: ${theme.colors.text.primary};
  background: ${theme.colors.bg.card};
  cursor: pointer;
  transition: ${theme.animations.transition};

  &:hover:not(:disabled) {
    border-color: ${theme.colors.border.focus};
    background: ${theme.colors.bg.glass};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const TestResult = styled.div<{ $ok: boolean }>`
  font-size: 13px;
  color: ${(p) => (p.$ok ? theme.colors.text.success : theme.colors.text.error)};
  font-weight: 500;
`

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const StatusDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(p) => p.$color};
  flex-shrink: 0;
`

const StatusText = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${theme.colors.text.primary};
`

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const InfoLabel = styled.span`
  font-size: 11px;
  color: ${theme.colors.text.muted};
  font-weight: 500;
`

const InfoValue = styled.span`
  font-size: 14px;
  color: ${theme.colors.text.primary};
  font-weight: 500;
`

const ErrorText = styled.div`
  font-size: 13px;
  color: ${theme.colors.text.error};
  background: rgba(200, 0, 0, 0.05);
  padding: 6px 10px;
  border-radius: 6px;
`

const HelpText = styled.p`
  font-size: 12px;
  line-height: 1.6;
  color: ${theme.colors.text.muted};
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid ${theme.colors.border.card};
`
