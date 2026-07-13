import { useEffect, useState, useRef } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'
import { METEOR_ICON_URL } from '../assets'

interface CaptureTriggerProps {
  onTrigger: (excerpt: string) => void
  shadowHost: HTMLElement
}

type TriggerPlacement = 'above' | 'below'

interface TriggerPosition {
  x: number
  y: number
  placement: TriggerPlacement
}

const TRIGGER_GAP = 12
const TRIGGER_EDGE_PADDING = 12
const TRIGGER_MIN_ABOVE_SPACE = 52

export function calculateTriggerPosition(
  rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>,
  viewport: { width: number; height: number },
): TriggerPosition {
  const placement: TriggerPlacement = rect.top >= TRIGGER_MIN_ABOVE_SPACE ? 'above' : 'below'

  return {
    x: Math.min(
      Math.max(rect.left + rect.width / 2, TRIGGER_EDGE_PADDING),
      viewport.width - TRIGGER_EDGE_PADDING,
    ),
    y:
      placement === 'above'
        ? rect.top - TRIGGER_GAP
        : Math.min(rect.bottom + TRIGGER_GAP, viewport.height - TRIGGER_EDGE_PADDING),
    placement,
  }
}

export function CaptureTrigger({ onTrigger, shadowHost }: CaptureTriggerProps) {
  const [position, setPosition] = useState<TriggerPosition | null>(null)
  const [selectionText, setSelectionText] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Ignore clicks inside our own shadow host
      if (shadowHost.contains(e.target as Node)) {
        return
      }

      // Small delay to let the browser finalize selection
      setTimeout(() => {
        const selection = window.getSelection()
        if (!selection) return

        const text = selection.toString().trim()
        if (!text) {
          setPosition(null)
          setSelectionText('')
          return
        }

        // Check if selection is inside an input or textarea
        const activeEl = document.activeElement
        if (
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            (activeEl as HTMLElement).isContentEditable)
        ) {
          setPosition(null)
          setSelectionText('')
          return
        }

        try {
          const range = selection.getRangeAt(0)
          const rect = range.getBoundingClientRect()
          const nextPosition = calculateTriggerPosition(rect, {
            width: window.innerWidth,
            height: window.innerHeight,
          })

          setPosition(nextPosition)
          setSelectionText(text)
        } catch {
          // Range might be invalid
          setPosition(null)
          setSelectionText('')
        }
      }, 50)
    }

    const handleMouseDown = (e: MouseEvent) => {
      // Clicking our button should not close the trigger immediately
      if (buttonRef.current?.contains(e.target as Node)) {
        return
      }
      // Ignore clicks inside our own shadow host
      if (shadowHost.contains(e.target as Node)) {
        return
      }
      setPosition(null)
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [shadowHost])

  if (!position) return null

  return (
    <FloatingButton
      ref={buttonRef}
      data-placement={position.placement}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        onTrigger(selectionText)
        setPosition(null)
        // Clear window selection
        window.getSelection()?.removeAllRanges()
      }}
    >
      <GleamIcon src={METEOR_ICON_URL} alt="" />
      <span>拾光</span>
    </FloatingButton>
  )
}

const FloatingButton = styled.button`
  position: fixed;
  transform: translate(-50%, -100%);
  display: flex;
  align-items: center;
  gap: 6px;
  background: ${theme.colors.bg.glass};
  border: 1px solid ${theme.colors.border.light};
  border-radius: 20px;
  padding: 8px 14px;
  color: ${theme.colors.text.primary};
  font-family: ${theme.typography.fontFamily};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: ${theme.shadows.glow};
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 2147483647;
  transition: ${theme.animations.spring};
  animation: floatInAbove 0.2s ease-out;

  &[data-placement='below'] {
    transform: translate(-50%, 0);
    animation-name: floatInBelow;
  }

  &:hover {
    border-color: ${theme.colors.border.focus};
    transform: translate(-50%, -100%) scale(1.05);
    background: ${theme.colors.bg.base};
    box-shadow: 0 0 15px ${theme.colors.brand.glow};
  }

  &[data-placement='below']:hover {
    transform: translate(-50%, 0) scale(1.05);
  }

  @keyframes floatInAbove {
    from {
      opacity: 0;
      transform: translate(-50%, -90%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -100%) scale(1);
    }
  }

  @keyframes floatInBelow {
    from {
      opacity: 0;
      transform: translate(-50%, 10%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }
`

const GleamIcon = styled.img`
  width: 14px;
  height: 14px;
  filter: drop-shadow(0 0 3px ${theme.colors.brand.primary});
`
