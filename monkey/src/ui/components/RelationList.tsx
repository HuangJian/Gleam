import styled from '@emotion/styled'
import type { GleamRelation } from '../../domain/intelligence'
import { theme } from '../theme'

interface RelationListProps {
  relations: GleamRelation[]
  onRelationClick: (targetId: string) => void
}

export function RelationList({ relations, onRelationClick }: RelationListProps) {
  if (relations.length === 0) return null

  const truncate = (text: string, max = 60) => (text.length > max ? text.slice(0, max) + '…' : text)

  return (
    <Section>
      <SectionHeader>相关拾光</SectionHeader>
      <RelationItems>
        {relations.map((rel) => (
          <RelationItem
            key={rel.id}
            onClick={() => onRelationClick(rel.targetGleam.id)}
            title={rel.targetGleam.thought}
          >
            <RelationBullet>◦</RelationBullet>
            <RelationText>{truncate(rel.targetGleam.thought)}</RelationText>
            {rel.origin === 'ai' && rel.strength !== null && (
              <StrengthLabel>{Math.round(rel.strength * 100)}%</StrengthLabel>
            )}
          </RelationItem>
        ))}
      </RelationItems>
    </Section>
  )
}

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const SectionHeader = styled.div`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: ${theme.colors.text.muted};
  padding-bottom: 4px;
  border-bottom: 1px solid ${theme.colors.border.card};
`

const RelationItems = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const RelationItem = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  font-family: inherit;
  transition: ${theme.animations.transition};

  &:hover {
    background: ${theme.colors.reference.bg};
  }
`

const RelationBullet = styled.span`
  color: ${theme.colors.intelligence.accent};
  font-size: 14px;
  flex-shrink: 0;
`

const RelationText = styled.span`
  font-size: 13px;
  color: ${theme.colors.text.secondary};
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const StrengthLabel = styled.span`
  font-size: 11px;
  color: ${theme.colors.text.muted};
  flex-shrink: 0;
`
