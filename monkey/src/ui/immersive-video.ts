import { useEffect, useState } from 'preact/hooks'

/** A <video> element (or test double) whose box we can measure. */
export interface CoverableVideo {
  getBoundingClientRect(): { width: number; height: number; top: number; bottom: number }
}

export interface Viewport {
  width: number
  height: number
}

/**
 * Fraction of the *viewport width* a video must span before we treat the page
 * as "immersive video" (web fullscreen). 0.9 catches edge-to-edge players
 * (Bilibili web fullscreen, YouTube full-width theater) while leaving normal
 * inline videos (typically < 70% of a wide window) alone. Height is not
 * required — YouTube's full-width player is letterboxed (short height) yet
 * should still hide the FAB.
 */
export const VIEWPORT_COVERAGE_THRESHOLD = 0.9

/**
 * Known "web fullscreen" (网页全屏) markers per host. When a site toggles web
 * fullscreen it mutates a player container's class; matching it is a fast,
 * precise path that supplements the generic coverage check below.
 *
 * NOTE: video-site player DOM changes often. Verify these selectors against the
 * live site before relying on them; the generic coverage check still catches
 * web fullscreen even if a selector goes stale.
 */
export const WEB_FULLSCREEN_SELECTORS: Record<string, string[]> = {
  'bilibili.com': [
    '.bpx-player-container.web-fullscreen-fix',
    '.bilibili-player-area.web-fullscreen-fix',
    '.bpx-player-container.is-web-fullscreen',
  ],
  // YouTube has no "web fullscreen" — its full-screen button uses the
  // Fullscreen API, which the browser already excludes our FAB from.
  'youtube.com': [],
}

/**
 * True when the video spans at least `threshold` of the viewport *width* and
 * is actually on screen. A full-width video scrolled entirely out of the
 * vertical viewport is ignored so a below-the-fold video can't hide the FAB.
 */
export function videoCoversViewport(
  rect: { width: number; top: number; bottom: number },
  viewport: Viewport,
  threshold = VIEWPORT_COVERAGE_THRESHOLD,
): boolean {
  if (viewport.width <= 0 || viewport.height <= 0) return false
  // Off-screen vertically (fully above or below the viewport) → not immersive.
  if (rect.bottom <= 0 || rect.top >= viewport.height) return false
  return rect.width / viewport.width >= threshold
}

/**
 * Return the video that most fully spans the viewport width (≥ `threshold`),
 * or null if none qualifies and is on screen. Width-based so letterboxed
 * full-width players (e.g. YouTube) are caught, not just edge-to-edge ones.
 */
export function findCoveringVideo(
  videos: CoverableVideo[],
  viewport: Viewport,
  threshold = VIEWPORT_COVERAGE_THRESHOLD,
): CoverableVideo | null {
  let best: CoverableVideo | null = null
  let bestRatio = 0
  for (const v of videos) {
    const rect = v.getBoundingClientRect()
    if (!videoCoversViewport(rect, viewport, threshold)) continue
    const rx = rect.width / viewport.width
    if (rx > bestRatio) {
      best = v
      bestRatio = rx
    }
  }
  return best
}

/** Resolve the selector list for a hostname, matching exact then suffix (e.g.
 *  www.bilibili.com → bilibili.com), but never a bare TLD like "com". */
export function selectorsForHost(
  hostname: string,
  allowlist: Record<string, string[]> = WEB_FULLSCREEN_SELECTORS,
): string[] {
  if (allowlist[hostname]) return allowlist[hostname]
  const parts = hostname.split('.')
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.')
    if (allowlist[candidate]) return allowlist[candidate]
  }
  return []
}

/** True if the document currently shows a known "web fullscreen" player. */
export function matchWebFullscreenSelectors(
  doc: Document,
  allowlist: Record<string, string[]> = WEB_FULLSCREEN_SELECTORS,
): boolean {
  const host = doc.location?.hostname ?? ''
  const selectors = selectorsForHost(host, allowlist)
  if (selectors.length === 0) return false
  return selectors.some((sel) => doc.querySelector(sel) != null)
}

/**
 * True when a natively-fullscreened element is (or wraps) a video player, so
 * the FAB would overlap the video. Excludes non-video fullscreen (e.g. a code
 * editor or image viewer) where hiding the FAB would be surprising.
 */
export function fullscreenElementIsMedia(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  if (tag === 'video') return true
  return typeof el.querySelector === 'function' && el.querySelector('video') != null
}

export interface ImmersiveOptions {
  threshold?: number
  allowlist?: Record<string, string[]>
}

/**
 * Detect "immersive video" mode — a video filling the screen, covering:
 *   1. Web fullscreen / 网页全屏: player expands via CSS (no Fullscreen API).
 *   2. Native fullscreen / 全屏播放: Fullscreen API.
 *
 * Native fullscreen used to be excluded on the theory that the browser paints
 * only the fullscreen element's subtree, hiding our (sibling) FAB. That does
 * NOT hold on YouTube — the FAB still floats over the video — so we hide it
 * whenever a player fills the screen, in either mode. During native fullscreen
 * the <video> rect equals the screen, so the width-based coverage check below
 * catches it; we also short-circuit on `fullscreenElement` for robustness.
 */
export function isImmersiveVideoMode(
  doc: Document = document,
  opts: ImmersiveOptions = {},
): boolean {
  const view = doc.defaultView
  if (!view) return false
  const viewport: Viewport = { width: view.innerWidth, height: view.innerHeight }
  if (viewport.width <= 0 || viewport.height <= 0) return false

  const videos = Array.from(doc.querySelectorAll('video')) as unknown as CoverableVideo[]
  if (findCoveringVideo(videos, viewport, opts.threshold ?? VIEWPORT_COVERAGE_THRESHOLD))
    return true

  // Native fullscreen of a video/player container the FAB may overlap.
  if (doc.fullscreenElement != null && fullscreenElementIsMedia(doc.fullscreenElement)) return true

  return matchWebFullscreenSelectors(doc, opts.allowlist)
}

/**
 * Reactively report whether the page is in immersive video mode. Recomputes on
 * window resize, native fullscreen changes, and a debounced MutationObserver
 * that catches players toggling their web-fullscreen class/style. No polling
 * loop, so an idle page costs nothing.
 */
export function useImmersiveVideo(opts: ImmersiveOptions = {}): boolean {
  const [immersive, setImmersive] = useState(() => isImmersiveVideoMode(document, opts))

  useEffect(() => {
    const recompute = () => setImmersive(isImmersiveVideoMode(document, opts))
    let timer: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(recompute, 150)
    }

    window.addEventListener('resize', recompute)
    window.addEventListener('fullscreenchange', recompute)

    let observer: MutationObserver | null = null
    const root = document.documentElement
    if (root && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(debounced)
      observer.observe(root, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      })
    }

    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('fullscreenchange', recompute)
      if (timer) clearTimeout(timer)
      observer?.disconnect()
    }
    // opts is treated as stable configuration; re-running on every render is
    // unnecessary and would thrash the MutationObserver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return immersive
}
