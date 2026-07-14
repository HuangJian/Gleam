import { useEffect, useState, useRef } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'
import { METEOR_ICON_URL } from '../assets'
import { SourceMedia } from '../../domain/gleam'

interface CaptureTriggerProps {
  onTrigger: (payload: { excerpt?: string; media?: SourceMedia }) => void
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

/**
 * Returns a media anchor for a right-clicked element, or undefined if the
 * target is not a capturable media element. Uses `currentSrc` when available so
 * that resolved sources (e.g. <video> poster frames / source resolution) win.
 */
export function detectMediaTarget(target: EventTarget | null): SourceMedia | undefined {
  if (!(target instanceof HTMLElement)) return undefined
  if (target instanceof HTMLImageElement) {
    return { kind: 'image', src: target.currentSrc || target.src }
  }
  if (target instanceof HTMLVideoElement) {
    return { kind: 'video', src: target.currentSrc || target.src }
  }
  if (target instanceof HTMLAudioElement) {
    return { kind: 'audio', src: target.currentSrc || target.src }
  }
  return undefined
}

export function CaptureTrigger({ onTrigger, shadowHost }: CaptureTriggerProps) {
  const [position, setPosition] = useState<TriggerPosition | null>(null)
  const [selectionText, setSelectionText] = useState('')
  const [mediaPayload, setMediaPayload] = useState<SourceMedia | undefined>(undefined)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isHoveringRef = useRef(false)

  const clearTrigger = () => {
    setPosition(null)
    setSelectionText('')
    setMediaPayload(undefined)
  }

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Only react to left-button selections; right-click is the media
      // capture gesture and must not clear an already-shown media trigger.
      if (e.button !== 0) return
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
          clearTrigger()
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
          clearTrigger()
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
          clearTrigger()
        }
      }, 50)
    }

    const handleMouseDown = (e: MouseEvent) => {
      // Clicking our button should not close the trigger immediately
      if (buttonRef.current?.contains(e.target as Node)) {
        return
      }
      // Clicks inside our shadow DOM are retargeted to the host element when
      // observed from the document, so treat the host itself as "inside".
      if (e.target === shadowHost || shadowHost.contains(e.target as Node)) {
        return
      }
      clearTrigger()
    }

    // Hover-dwell: show the capture button after the pointer rests on a media
    // element for a short delay. Avoids hijacking the native context menu.
    const startDwell = (target: EventTarget | null) => {
      const media = detectMediaTarget(target)
      if (!media) return
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current)
      dwellTimerRef.current = setTimeout(() => {
        const el = target as HTMLElement
        const rect = el.getBoundingClientRect()
        const nextPosition = calculateTriggerPosition(rect, {
          width: window.innerWidth,
          height: window.innerHeight,
        })
        setPosition(nextPosition)
        setSelectionText('')
        setMediaPayload(media)
      }, 1600)
    }

    const cancelDwell = () => {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current)
        dwellTimerRef.current = null
      }
    }

    const handleMouseOver = (e: MouseEvent) => {
      if (shadowHost.contains(e.target as Node)) return
      // Only (re)start dwell when entering a media element, not on every
      // mousemove inside it.
      if (e.target === lastHoverTarget) return
      lastHoverTarget = e.target as HTMLElement
      cancelDwell()
      startDwell(e.target)
    }

    const handleMouseOut = (e: MouseEvent) => {
      // Fired when leaving any element; only act if we're leaving the page
      // entirely or moving to a non-media element.
      const related = e.relatedTarget as Node | null
      if (related && detectMediaTarget(related)) return
      lastHoverTarget = null
      cancelDwell()
    }

    let lastHoverTarget: HTMLElement | null = null

    // Scrolling invalidates the button's fixed position relative to the
    // element, so dismiss and reset dwell.
    const handleScroll = () => {
      cancelDwell()
      clearTrigger()
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mouseover', handleMouseOver)
    document.addEventListener('mouseout', handleMouseOut)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mouseover', handleMouseOver)
      document.removeEventListener('mouseout', handleMouseOut)
      window.removeEventListener('scroll', handleScroll, true)
      cancelDwell()
    }
  }, [shadowHost])

  // Auto-hide after 8s if mouse is not hovering
  useEffect(() => {
    if (!position) return
    hideTimerRef.current = setTimeout(() => {
      if (!isHoveringRef.current) {
        clearTrigger()
      }
    }, 8000)
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [position])

  if (!position) return null

  return (
    <FloatingButton
      ref={buttonRef}
      data-placement={position.placement}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseEnter={() => {
        isHoveringRef.current = true
      }}
      onMouseLeave={() => {
        isHoveringRef.current = false
      }}
      onMouseDown={(e: MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        onTrigger({ excerpt: selectionText || undefined, media: mediaPayload })
        setPosition(null)
        setSelectionText('')
        setMediaPayload(undefined)
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
