import { useState } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'
import { SourceMedia } from '../../domain/gleam'

interface MediaPreviewProps {
  media: SourceMedia
  compact?: boolean
  /** Show the "图片 · 原始来源" label above the media. Default: true. */
  showLabel?: boolean
  /** Remove the max-height cap so the media displays at full size (detail view). */
  fullSize?: boolean
}

const KIND_LABEL: Record<SourceMedia['kind'], string> = {
  image: '图片',
  audio: '音频',
  video: '视频',
}

export function MediaPreview({
  media,
  compact = false,
  showLabel = true,
  fullSize = false,
}: MediaPreviewProps) {
  const [failed, setFailed] = useState(false)

  const handleError = () => setFailed(true)

  return (
    <Wrapper $compact={compact}>
      {showLabel && (
        <Label>
          {KIND_LABEL[media.kind]} ·{' '}
          <SourceLink href={media.src} target="_blank" rel="noopener noreferrer">
            原始来源
          </SourceLink>
        </Label>
      )}
      {failed ? (
        <ErrorHint>该媒体来自原网站，跨站访问可能受防盗链限制而无法显示</ErrorHint>
      ) : media.kind === 'image' ? (
        <PreviewImage
          src={media.src}
          alt="捕获的媒体"
          onError={handleError}
          $compact={compact}
          $fullSize={fullSize}
        />
      ) : media.kind === 'audio' ? (
        <AudioEl controls src={media.src} onError={handleError} />
      ) : (
        <VideoEl
          controls
          src={media.src}
          onError={handleError}
          $compact={compact}
          $fullSize={fullSize}
        />
      )}
    </Wrapper>
  )
}

const Wrapper = styled.div<{ $compact: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: ${(p) => (p.$compact ? '8px 0' : '12px 0')};
  border-top: 1px solid ${theme.colors.border.card};
  margin-top: ${(p) => (p.$compact ? '8px' : '12px')};
`

const Label = styled.span`
  font-size: 11px;
  color: ${theme.colors.text.muted};
  font-weight: 500;
`

const SourceLink = styled.a`
  color: ${theme.colors.text.accent};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`

const PreviewImage = styled.img<{ $compact: boolean; $fullSize: boolean }>`
  max-width: 100%;
  max-height: ${(p) =>
    p.$fullSize ? 'none' : p.$compact ? '160px' : 'calc(var(--gleam-modal-height, 80vh) * 0.4)'};
  border-radius: 8px;
  border: 1px solid ${theme.colors.border.light};
  object-fit: contain;
  background: ${theme.colors.bg.input};
`

const VideoEl = styled.video<{ $compact: boolean; $fullSize: boolean }>`
  max-width: 100%;
  max-height: ${(p) =>
    p.$fullSize ? 'none' : p.$compact ? '200px' : 'calc(var(--gleam-modal-height, 80vh) * 0.4)'};
  border-radius: 8px;
  border: 1px solid ${theme.colors.border.light};
  background: #000;
`

const AudioEl = styled.audio`
  width: 100%;
`

const ErrorHint = styled.div`
  font-size: 12px;
  color: ${theme.colors.text.muted};
  background: rgba(200, 180, 140, 0.08);
  border: 1px dashed ${theme.colors.border.light};
  border-radius: 8px;
  padding: 10px 12px;
  line-height: 1.5;
`
