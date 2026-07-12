import { useState } from 'preact/hooks'
import styled from '@emotion/styled'
import { Gleam } from '../../domain/gleam'
import { theme } from '../theme'

interface GleamCardProps {
  gleam: Gleam
  onDelete: (id: string) => void
  onRevisit: (id: string) => void
}

export function GleamCard({ gleam, onDelete, onRevisit }: GleamCardProps) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const getFormattedTime = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getSourceHost = (url?: string) => {
    if (!url) return ''
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }

  const handleCardClick = () => {
    // Record this revisit in the background
    onRevisit(gleam.id)
  }

  return (
    <Card onClick={handleCardClick}>
      <CardHeader>
        <TimeLabel>{getFormattedTime(gleam.created_at)}</TimeLabel>
        <HeaderActions>
          {gleam.revisit_count && gleam.revisit_count > 0 ? (
            <RevisitBadge title={`回顾次数: ${gleam.revisit_count}`}>
              👁 {gleam.revisit_count}
            </RevisitBadge>
          ) : null}

          {showConfirmDelete ? (
            <ConfirmDeleteGroup>
              <ConfirmDeleteBtn
                onClick={(e: MouseEvent) => {
                  e.stopPropagation()
                  onDelete(gleam.id)
                }}
              >
                确认
              </ConfirmDeleteBtn>
              <CancelDeleteBtn
                onClick={(e: MouseEvent) => {
                  e.stopPropagation()
                  setShowConfirmDelete(false)
                }}
              >
                取消
              </CancelDeleteBtn>
            </ConfirmDeleteGroup>
          ) : (
            <DeleteIconButton
              title="删除此条拾光"
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                setShowConfirmDelete(true)
              }}
            >
              <svg viewBox="0 0 24 24">
                <path d="M19 4H15.5L14.5 3H9.5L8.5 4H5V6H19M6 19A2 2 0 0 0 8 21H16A2 2 0 0 0 18 19V7H6V19Z" />
              </svg>
            </DeleteIconButton>
          )}
        </HeaderActions>
      </CardHeader>

      <ThoughtText>{gleam.thought}</ThoughtText>

      {gleam.source.excerpt && <SourceExcerpt>“ {gleam.source.excerpt} ”</SourceExcerpt>}

      {gleam.source.url && (
        <SourceFooter>
          <SourceIcon viewBox="0 0 24 24">
            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
          </SourceIcon>
          <LinkAnchor
            href={gleam.source.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e: MouseEvent) => e.stopPropagation()}
            title={gleam.source.url}
          >
            {gleam.source.title || getSourceHost(gleam.source.url) || '原始页面'}
          </LinkAnchor>
          <SourceHost>{getSourceHost(gleam.source.url)}</SourceHost>
        </SourceFooter>
      )}
    </Card>
  )
}

const Card = styled.div`
  background: ${theme.colors.bg.card};
  border: 1px solid ${theme.colors.border.card};
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
  transition: ${theme.animations.transition};
  position: relative;
  overflow: hidden;

  &:hover {
    border-color: ${theme.colors.border.light};
    transform: translateY(-2px);
    background: rgba(35, 41, 59, 0.9);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: 100%;
    background: ${theme.colors.brand.primary};
    opacity: 0.8;
  }
`

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const TimeLabel = styled.span`
  font-size: 11px;
  color: ${theme.colors.text.muted};
  font-weight: 500;
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const RevisitBadge = styled.span`
  font-size: 11px;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  color: ${theme.colors.text.muted};
`

const ConfirmDeleteGroup = styled.div`
  display: flex;
  gap: 4px;
`

const ConfirmDeleteBtn = styled.button`
  background: hsl(0, 75%, 45%);
  border: none;
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;

  &:hover {
    background: hsl(0, 85%, 55%);
  }
`

const CancelDeleteBtn = styled.button`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid ${theme.colors.border.light};
  color: ${theme.colors.text.secondary};
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`

const DeleteIconButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;

  svg {
    width: 14px;
    height: 14px;
    fill: ${theme.colors.text.muted};
    transition: ${theme.animations.transition};
  }

  &:hover svg {
    fill: hsl(0, 75%, 65%);
  }
`

const ThoughtText = styled.div`
  font-size: 14px;
  line-height: 1.6;
  color: ${theme.colors.text.primary};
  white-space: pre-wrap;
  font-weight: 450;
`

const SourceExcerpt = styled.blockquote`
  margin: 0;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.015);
  border-left: 2px solid rgba(255, 255, 255, 0.15);
  font-size: 12px;
  color: ${theme.colors.text.secondary};
  line-height: 1.5;
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`

const SourceFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.03);
  padding-top: 10px;
  margin-top: 4px;
`

const SourceIcon = styled.svg`
  width: 12px;
  height: 12px;
  fill: ${theme.colors.text.muted};
  flex-shrink: 0;
`

const LinkAnchor = styled.a`
  font-size: 12px;
  color: ${theme.colors.text.secondary};
  text-decoration: none;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
  transition: ${theme.animations.transition};

  &:hover {
    color: ${theme.colors.text.accent};
    text-decoration: underline;
  }
`

const SourceHost = styled.span`
  font-size: 10px;
  color: ${theme.colors.text.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  text-align: right;
`
