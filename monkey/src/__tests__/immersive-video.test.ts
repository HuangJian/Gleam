import { describe, test, expect } from 'bun:test'
import {
  videoCoversViewport,
  findCoveringVideo,
  selectorsForHost,
  matchWebFullscreenSelectors,
  fullscreenElementIsMedia,
  isImmersiveVideoMode,
  VIEWPORT_COVERAGE_THRESHOLD,
  type CoverableVideo,
  type Viewport,
} from '../ui/immersive-video'

const VP = { width: 1280, height: 720 }

function video(rect: {
  width: number
  height: number
  top?: number
  bottom?: number
}): CoverableVideo {
  return {
    getBoundingClientRect: () => ({
      width: rect.width,
      height: rect.height,
      top: rect.top ?? 0,
      bottom: rect.bottom ?? rect.height,
    }),
  }
}

describe('videoCoversViewport', () => {
  test('true when width meets the threshold and is on-screen', () => {
    expect(videoCoversViewport({ width: 1280, top: 0, bottom: 720 }, VP)).toBe(true)
    expect(videoCoversViewport({ width: 1152, top: 0, bottom: 720 }, VP)).toBe(true) // exactly 0.9
  })

  test('false when width falls short of the threshold', () => {
    expect(videoCoversViewport({ width: 1000, top: 0, bottom: 720 }, VP)).toBe(false) // 0.78
  })

  test('false when the video is outside the vertical viewport (scrolled away)', () => {
    expect(videoCoversViewport({ width: 1280, top: 1000, bottom: 1720 }, VP)).toBe(false) // below fold
    expect(videoCoversViewport({ width: 1280, top: -200, bottom: -50 }, VP)).toBe(false) // above fold
  })

  test('false on a degenerate viewport', () => {
    expect(videoCoversViewport({ width: 1280, top: 0, bottom: 720 }, { width: 0, height: 0 })).toBe(
      false,
    )
  })

  test('does not require full height (letterboxed full-width video still counts)', () => {
    // YouTube full-width player: width fills, height is letterboxed.
    expect(
      videoCoversViewport({ width: 1280, top: 45, bottom: 810 }, { width: 1280, height: 900 }),
    ).toBe(true)
  })
})

describe('findCoveringVideo', () => {
  test('returns null when no video spans enough viewport width', () => {
    expect(findCoveringVideo([video({ width: 640, height: 360 })], VP)).toBeNull()
  })

  test('returns the covering video (width-based)', () => {
    const big = video({ width: 1280, height: 720 })
    const small = video({ width: 640, height: 360 })
    expect(findCoveringVideo([small, big], VP)).toBe(big)
  })

  test('picks the widest-covering video when several qualify', () => {
    const a = video({ width: 1280, height: 720 })
    const b = video({ width: 1200, height: 720 })
    expect(findCoveringVideo([a, b], VP)).toBe(a)
  })

  test('ignores a full-width video scrolled out of view', () => {
    expect(
      findCoveringVideo([video({ width: 1280, height: 720, top: 5000, bottom: 5720 })], VP),
    ).toBeNull()
  })
})

describe('selectorsForHost', () => {
  const allowlist = { 'bilibili.com': ['.x'] }

  test('exact match', () => {
    expect(selectorsForHost('bilibili.com', allowlist)).toEqual(['.x'])
  })

  test('suffix match for subdomains', () => {
    expect(selectorsForHost('www.bilibili.com', allowlist)).toEqual(['.x'])
    expect(selectorsForHost('live.bilibili.com', allowlist)).toEqual(['.x'])
  })

  test('never matches a bare TLD', () => {
    expect(selectorsForHost('com', allowlist)).toEqual([])
  })

  test('unknown host returns empty', () => {
    expect(selectorsForHost('example.com', allowlist)).toEqual([])
  })
})

describe('matchWebFullscreenSelectors', () => {
  function docWith(host: string, selector?: string): Document {
    return {
      location: { hostname: host },
      querySelector: (sel: string) => (sel === selector ? ({} as Element) : null),
    } as unknown as Document
  }

  test('matches when a known player selector is present', () => {
    const doc = docWith('www.bilibili.com', '.bpx-player-container.web-fullscreen-fix')
    expect(matchWebFullscreenSelectors(doc)).toBe(true)
  })

  test('no match when the selector is absent', () => {
    const doc = docWith('www.bilibili.com', '.something-else')
    expect(matchWebFullscreenSelectors(doc)).toBe(false)
  })

  test('empty allowlist yields no match (e.g. youtube)', () => {
    const doc = docWith('www.youtube.com', '.anything')
    expect(matchWebFullscreenSelectors(doc)).toBe(false)
  })
})

describe('fullscreenElementIsMedia', () => {
  test('true when the fullscreen element is a <video>', () => {
    const el = { tagName: 'VIDEO' } as unknown as Element
    expect(fullscreenElementIsMedia(el)).toBe(true)
  })

  test('true when the fullscreen element wraps a <video> (e.g. #movie_player)', () => {
    const el = {
      tagName: 'DIV',
      querySelector: (sel: string) => (sel === 'video' ? ({} as Element) : null),
    } as unknown as Element
    expect(fullscreenElementIsMedia(el)).toBe(true)
  })

  test('false for a non-video fullscreen element (e.g. a code editor)', () => {
    const el = { tagName: 'DIV', querySelector: () => null } as unknown as Element
    expect(fullscreenElementIsMedia(el)).toBe(false)
  })

  test('false for null', () => {
    expect(fullscreenElementIsMedia(null)).toBe(false)
  })
})

describe('isImmersiveVideoMode', () => {
  function fakeDoc(opts: {
    videos?: CoverableVideo[]
    fullscreenElement?: Element | null
    host?: string
    matchedSelector?: string
    viewport?: Viewport
  }): Document {
    const videos = opts.videos ?? []
    const vp = opts.viewport ?? VP
    return {
      fullscreenElement: opts.fullscreenElement ?? null,
      location: { hostname: opts.host ?? 'example.com' },
      defaultView: { innerWidth: vp.width, innerHeight: vp.height },
      querySelectorAll: (sel: string) => (sel === 'video' ? (videos as unknown as Element[]) : []),
      querySelector: (sel: string) => (sel === opts.matchedSelector ? ({} as Element) : null),
    } as unknown as Document
  }

  test('true during native fullscreen of a <video> (YouTube 全屏播放)', () => {
    // No covering video reported (test double lacks layout), but the fullscreen
    // element itself is the video — the FAB must still hide.
    const doc = fakeDoc({ fullscreenElement: { tagName: 'VIDEO' } as unknown as Element })
    expect(isImmersiveVideoMode(doc)).toBe(true)
  })

  test('true during native fullscreen of a player container wrapping a <video>', () => {
    const player = {
      tagName: 'DIV',
      querySelector: (sel: string) => (sel === 'video' ? ({} as Element) : null),
    } as unknown as Element
    const doc = fakeDoc({ fullscreenElement: player })
    expect(isImmersiveVideoMode(doc)).toBe(true)
  })

  test('false during native fullscreen of a non-video element', () => {
    const el = { tagName: 'DIV', querySelector: () => null } as unknown as Element
    const doc = fakeDoc({ fullscreenElement: el })
    expect(isImmersiveVideoMode(doc)).toBe(false)
  })

  test('true when a video covers the viewport width (generic web fullscreen)', () => {
    const doc = fakeDoc({ videos: [video({ width: 1280, height: 720 })] })
    expect(isImmersiveVideoMode(doc)).toBe(true)
  })

  test('false for a normal inline video', () => {
    const doc = fakeDoc({ videos: [video({ width: 640, height: 360 })] })
    expect(isImmersiveVideoMode(doc)).toBe(false)
  })

  test('true for a YouTube-style full-width player (width >= 90%, letterboxed height)', () => {
    // Reproduces the reported element: width:1440 top:45 height:810 in a 1440x900 window.
    const ytViewport = { width: 1440, height: 900 }
    const ytVideo = video({ width: 1440, height: 810, top: 45, bottom: 855 })
    const doc = fakeDoc({ videos: [ytVideo], viewport: ytViewport })
    expect(isImmersiveVideoMode(doc)).toBe(true)
  })

  test('true via known-player selector even without a covering video', () => {
    const doc = fakeDoc({
      host: 'www.bilibili.com',
      matchedSelector: '.bpx-player-container.web-fullscreen-fix',
    })
    expect(isImmersiveVideoMode(doc)).toBe(true)
  })

  test('default threshold is 0.9', () => {
    expect(VIEWPORT_COVERAGE_THRESHOLD).toBe(0.9)
  })
})
