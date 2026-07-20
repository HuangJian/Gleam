import { useState, useEffect } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'
import type { SyncState } from '../../services/sync'
import type { IntelligenceConfigView } from '../../domain/intelligence'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  syncState: SyncState
  serverUrl: string
  onSaveUrl: (url: string) => void
  onTestConnection: () => Promise<boolean>
  onSyncNow: () => Promise<void>
  onGetIntelligenceConfig: () => Promise<IntelligenceConfigView | null>
  onConfigureProvider: (provider: string, model: string, apiKey: string) => Promise<void>
  onRemoveProvider: () => Promise<void>
}

export function SettingsPanel({
  isOpen,
  onClose,
  syncState,
  serverUrl,
  onSaveUrl,
  onTestConnection,
  onSyncNow,
  onGetIntelligenceConfig,
  onConfigureProvider,
  onRemoveProvider,
}: SettingsPanelProps) {
  const [urlInput, setUrlInput] = useState(serverUrl)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'fail'>('idle')

  // Intelligence config state
  const [aiConfig, setAiConfig] = useState<IntelligenceConfigView | null>(null)
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o-mini')
  const [apiKey, setApiKey] = useState('')
  const [aiSaving, setAiSaving] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiRemoving, setAiRemoving] = useState(false)

  // Fetch intelligence config when panel opens
  useEffect(() => {
    if (!isOpen) return
    setAiError(null)
    onGetIntelligenceConfig().then((config) => {
      setAiConfig(config)
      if (config) {
        setProvider(config.provider)
        setModel(config.model)
      }
    })
  }, [isOpen])

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

  const handleConfigureProvider = async () => {
    setAiSaving(true)
    setAiError(null)
    try {
      await onConfigureProvider(provider, model, apiKey)
      // Refresh config
      const config = await onGetIntelligenceConfig()
      setAiConfig(config)
      setApiKey('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('GLEAM_BACKEND_SECRET')) {
        setAiError('服务端未配置加密密钥，请联系管理员设置 GLEAM_BACKEND_SECRET 环境变量。')
      } else {
        setAiError(msg)
      }
    } finally {
      setAiSaving(false)
    }
  }

  const handleRemoveProvider = async () => {
    setAiRemoving(true)
    setAiError(null)
    try {
      await onRemoveProvider()
      setAiConfig(null)
      setApiKey('')
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '移除失败')
    } finally {
      setAiRemoving(false)
    }
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

        {/* AI 观察者 Section */}
        <Section>
          <SectionLabel>AI 观察者</SectionLabel>

          {aiConfig ? (
            <>
              <ConfigInfo>
                <ConfigRow>
                  <ConfigLabel>当前提供方:</ConfigLabel>
                  <ConfigValue>{aiConfig.provider}</ConfigValue>
                </ConfigRow>
                <ConfigRow>
                  <ConfigLabel>当前模型:</ConfigLabel>
                  <ConfigValue>{aiConfig.model}</ConfigValue>
                </ConfigRow>
                <ConfigRow>
                  <ConfigLabel>API Key:</ConfigLabel>
                  <ConfigValue>{aiConfig.hasApiKey ? '已配置 ✓' : '未配置'}</ConfigValue>
                </ConfigRow>
              </ConfigInfo>

              <PrivacyNotice>⚠ 修改模型或提供方需要重新输入 API Key。</PrivacyNotice>

              <ProviderSelect
                value={provider}
                onChange={(e: Event) => setProvider((e.target as HTMLSelectElement).value)}
              >
                <option value="openai">openai</option>
              </ProviderSelect>
              <ModelInput
                type="text"
                placeholder="模型名称"
                value={model}
                onInput={(e: Event) => setModel((e.target as HTMLInputElement).value)}
              />
              <ApiKeyInput
                type="password"
                placeholder="需重新输入 API Key"
                value={apiKey}
                onInput={(e: Event) => setApiKey((e.target as HTMLInputElement).value)}
              />
              <ButtonRow>
                <ActionButton
                  onClick={handleConfigureProvider}
                  disabled={aiSaving || !apiKey.trim()}
                  title="更新配置"
                >
                  {aiSaving ? '验证中…' : '更新配置'}
                </ActionButton>
                <ActionButton onClick={handleRemoveProvider} disabled={aiRemoving} title="删除配置">
                  {aiRemoving ? '删除中…' : '删除配置'}
                </ActionButton>
              </ButtonRow>
            </>
          ) : (
            <>
              <ConfigInfo>尚未配置 LLM 提供方。</ConfigInfo>
              <ConfigInfo>
                启用后，AI 将在后台自动为你的拾光生成摘要、标签，并发现语义关联。
              </ConfigInfo>

              <PrivacyNotice>
                ⚠ 你的拾光内容（thought、source 等）将被发送到外部 LLM 服务进行语义分析。
              </PrivacyNotice>

              <ProviderSelect
                value={provider}
                onChange={(e: Event) => setProvider((e.target as HTMLSelectElement).value)}
              >
                <option value="openai">openai</option>
              </ProviderSelect>
              <ModelInput
                type="text"
                placeholder="模型名称"
                value={model}
                onInput={(e: Event) => setModel((e.target as HTMLInputElement).value)}
              />
              <ApiKeyInput
                type="password"
                placeholder="API Key"
                value={apiKey}
                onInput={(e: Event) => setApiKey((e.target as HTMLInputElement).value)}
              />
              <ButtonRow>
                <ActionButton
                  onClick={handleConfigureProvider}
                  disabled={aiSaving || !apiKey.trim()}
                  title="验证并保存"
                >
                  {aiSaving ? '验证中…' : '验证并保存'}
                </ActionButton>
              </ButtonRow>
            </>
          )}

          {aiError && <ErrorText>{aiError}</ErrorText>}
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
  max-height: 85vh;
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

const ConfigInfo = styled.div`
  font-size: 13px;
  color: ${theme.colors.text.secondary};
  line-height: 1.6;
`

const ConfigRow = styled.div`
  display: flex;
  gap: 8px;
`

const ConfigLabel = styled.span`
  font-size: 13px;
  color: ${theme.colors.text.muted};
  flex-shrink: 0;
`

const ConfigValue = styled.span`
  font-size: 13px;
  color: ${theme.colors.text.primary};
  font-weight: 500;
`

const PrivacyNotice = styled.div`
  font-size: 12px;
  color: ${theme.colors.text.warning};
  background: rgba(218, 165, 80, 0.08);
  border-radius: 6px;
  padding: 6px 10px;
  line-height: 1.5;
`

const ProviderSelect = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${theme.colors.border.light};
  border-radius: 8px;
  font-size: 14px;
  font-family: ${theme.typography.fontFamily};
  color: ${theme.colors.text.primary};
  background: ${theme.colors.bg.input};
  outline: none;
  cursor: pointer;
  box-sizing: border-box;
  transition: ${theme.animations.transition};

  &:focus {
    border-color: ${theme.colors.border.focus};
  }
`

const ModelInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${theme.colors.border.light};
  border-radius: 8px;
  font-size: 14px;
  font-family: ${theme.typography.fontFamily};
  color: ${theme.colors.text.primary};
  background: ${theme.colors.bg.input};
  outline: none;
  box-sizing: border-box;
  transition: ${theme.animations.transition};

  &:focus {
    border-color: ${theme.colors.border.focus};
  }
`

const ApiKeyInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${theme.colors.border.light};
  border-radius: 8px;
  font-size: 14px;
  font-family: ${theme.typography.fontFamily};
  color: ${theme.colors.text.primary};
  background: ${theme.colors.bg.input};
  outline: none;
  box-sizing: border-box;
  transition: ${theme.animations.transition};

  &:focus {
    border-color: ${theme.colors.border.focus};
  }

  &::placeholder {
    color: ${theme.colors.text.muted};
  }
`
