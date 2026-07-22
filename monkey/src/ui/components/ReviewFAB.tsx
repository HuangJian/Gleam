import { useEffect, useRef, useState } from 'preact/hooks'
import styled from '@emotion/styled'
import { theme } from '../theme'
import { METEOR_ICON_URL } from '../assets'
import { loadFabPosition, saveFabPosition, clearFabPosition } from '../../infra/gm-storage'
import { useImmersiveVideo } from '../immersive-video'

const FAB_SIZE = 48
const FAB_MARGIN = 24
const DRAG_THRESHOLD = 5

export interface FabPos {
  x: number
  y: number
}

export interface Viewport {
  width: number
  height: number
}

/** Keep a FAB position inside the viewport, leaving a margin on every edge. */
export function clampToViewport(
  pos: FabPos,
  vp: Viewport,
  size = FAB_SIZE,
  margin = FAB_MARGIN,
): FabPos {
  const maxX = Math.max(margin, vp.width - size - margin)
  const maxY = Math.max(margin, vp.height - size - margin)
  return {
    x: Math.min(Math.max(pos.x, margin), maxX),
    y: Math.min(Math.max(pos.y, margin), maxY),
  }
}

/** Snap a position to the nearer vertical edge (left/right), keeping Y. */
export function snapToEdge(
  pos: FabPos,
  vp: Viewport,
  size = FAB_SIZE,
  margin = FAB_MARGIN,
): FabPos {
  const clamped = clampToViewport(pos, vp, size, margin)
  const center = clamped.x + size / 2
  const snappedX = center < vp.width / 2 ? margin : vp.width - size - margin
  return { x: snappedX, y: clamped.y }
}

/** The default resting position: bottom-right corner. */
export function defaultFabPos(vp: Viewport): FabPos {
  return { x: vp.width - FAB_SIZE - FAB_MARGIN, y: vp.height - FAB_SIZE - FAB_MARGIN }
}

/** Convert a top-left position to right/bottom margins within a viewport. */
export function posToMargins(
  pos: FabPos,
  vp: Viewport,
  size = FAB_SIZE,
): { right: number; bottom: number } {
  return { right: vp.width - pos.x - size, bottom: vp.height - pos.y - size }
}

/** Convert right/bottom margins back to a top-left position. */
export function marginsToPos(
  m: { right: number; bottom: number },
  vp: Viewport,
  size = FAB_SIZE,
): FabPos {
  return { x: vp.width - m.right - size, y: vp.height - m.bottom - size }
}

interface ReviewFABProps {
  onClick: () => void
}

export function ReviewFAB({ onClick }: ReviewFABProps) {
  // Hide entirely while the page is in "web fullscreen" (网页全屏) so the
  // button doesn't float over the video. It stays in the DOM (display:none)
  // so the Tampermonkey menu command can still click it to open the review.
  const immersive = useImmersiveVideo()

  const [pos, setPos] = useState<FabPos>(() => {
    const vp = { width: window.innerWidth, height: window.innerHeight }
    const saved = loadFabPosition(location.hostname)
    if (saved) return clampToViewport(marginsToPos(saved, vp), vp)
    return defaultFabPos(vp)
  })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
    moved: number
  } | null>(null)

  // Keep the button on-screen when the viewport changes size.
  useEffect(() => {
    const onResize = () =>
      setPos((p) => clampToViewport(p, { width: window.innerWidth, height: window.innerHeight }))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = (e: PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: 0,
    }
    setDragging(true)
  }

  const onPointerMove = (e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    d.moved = Math.max(d.moved, Math.hypot(dx, dy))
    setPos(
      clampToViewport(
        { x: d.originX + dx, y: d.originY + dy },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    )
  }

  const onPointerUp = (e: PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (!d) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* pointer may already be released */
    }
    // A near-stationary press is a click, not a drag.
    if (d.moved < DRAG_THRESHOLD) {
      onClick()
      return
    }
    const finalPos = clampToViewport(
      { x: d.originX + (e.clientX - d.startX), y: d.originY + (e.clientY - d.startY) },
      { width: window.innerWidth, height: window.innerHeight },
    )
    const snapped = snapToEdge(finalPos, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    setPos(snapped)

    const vp = { width: window.innerWidth, height: window.innerHeight }
    const def = defaultFabPos(vp)
    // If the FAB is back at its default corner, drop the stored entry so we
    // don't keep redundant per-domain data.
    if (snapped.x === def.x && snapped.y === def.y) {
      clearFabPosition(location.hostname)
    } else {
      saveFabPosition(location.hostname, posToMargins(snapped, vp))
    }
  }

  return (
    <FloatingButton
      type="button"
      title="打开拾光 · 全屏回顾（可拖动到任意边缘）"
      aria-label="打开拾光 · 全屏回顾"
      aria-hidden={immersive || undefined}
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        cursor: dragging ? 'grabbing' : 'grab',
        transition: dragging ? 'none' : theme.animations.spring,
        ...(immersive ? { display: 'none', pointerEvents: 'none' as const } : {}),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <GleamIcon src={METEOR_ICON_URL} alt="" />
    </FloatingButton>
  )
}

const FloatingButton = styled.button`
  position: fixed;
  width: ${FAB_SIZE}px;
  height: ${FAB_SIZE}px;
  border-radius: 50%;
  background: ${theme.colors.bg.glass};
  border: 1px solid ${theme.colors.border.light};
  box-shadow: ${theme.shadows.glow};
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483645;
  touch-action: none;

  &:hover {
    border-color: ${theme.colors.border.focus};
    transform: scale(1.1) translateY(-2px);
    box-shadow: 0 0 25px ${theme.colors.brand.primary};
  }

  &:active {
    cursor: grabbing;
  }
`

const GleamIcon = styled.img`
  width: 20px;
  height: 20px;
  filter: drop-shadow(0 0 4px ${theme.colors.brand.primary});
  pointer-events: none;
`
