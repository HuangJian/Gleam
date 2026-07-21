import { describe, test, expect, vi, afterEach } from 'bun:test'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact'
import { App } from '../ui/App'
import { makeGleamWithIntelligence } from './helpers'

// jsdom lacks PointerEvent capture APIs used by ReviewFAB; stub them so we
// can drive the FAB open via pointerDown + pointerUp.
if (!(HTMLElement.prototype as any).setPointerCapture) {
  ;(HTMLElement.prototype as any).setPointerCapture = () => {}
  ;(HTMLElement.prototype as any).releasePointerCapture = () => {}
}

// Stub Tampermonkey GM_* storage globals used by App/SyncService.
const gmStore = new Map<string, unknown>()
;(globalThis as Record<string, unknown>).GM_getValue = (k: string, d?: unknown): unknown =>
  gmStore.has(k) ? gmStore.get(k) : d
;(globalThis as Record<string, unknown>).GM_setValue = (k: string, v: unknown): void => {
  gmStore.set(k, v)
}
;(globalThis as Record<string, unknown>).GM_deleteValue = (k: string): void => {
  gmStore.delete(k)
}
;(globalThis as Record<string, unknown>).GM_listValues = (): string[] => [...gmStore.keys()]

// happy-dom setup doesn't expose a bare `location` global (ReviewFAB reads
// location.hostname). Point it at the window's location.
if (!(globalThis as Record<string, unknown>).location) {
  ;(globalThis as Record<string, unknown>).location = (globalThis as any).window.location
}

const g1 = makeGleamWithIntelligence(
  {
    id: 'g1',
    thought: 'Latest insight about the new design',
    createdAt: '2026-07-21T12:00:00.000Z',
  },
  { summary: null, aiTags: [] },
)
const g2 = makeGleamWithIntelligence(
  {
    id: 'g2',
    thought: 'Older insight about the legacy system',
    createdAt: '2026-07-10T12:00:00.000Z',
  },
  { summary: null, aiTags: [] },
)

function makeFakeSync() {
  const items = [g1, g2]
  return {
    getState: () => ({ status: 'disconnected', pendingCount: 0, lastSyncAt: null, error: null }),
    subscribe: () => () => {},
    getTimeline: vi.fn().mockResolvedValue({ items, total: items.length, hasMore: false }),
    search: vi.fn().mockResolvedValue({
      items: items.map((item) => ({ item, score: 1, highlight: null })),
      total: items.length,
    }),
    updateDerivedFields: vi.fn().mockResolvedValue(undefined),
    getGleamRelations: vi.fn().mockResolvedValue([]),
    onGleamCaptured: vi.fn().mockResolvedValue(undefined),
    removeTag: vi.fn().mockResolvedValue(undefined),
    regenerateArtifact: vi.fn().mockResolvedValue(undefined),
    syncPending: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue(undefined),
    getIntelligenceConfig: vi.fn().mockResolvedValue(undefined),
    configureProvider: vi.fn().mockResolvedValue(undefined),
    removeProvider: vi.fn().mockResolvedValue(undefined),
  } as any
}

function makeFakeRepo() {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
    updateDerivedFields: vi.fn().mockResolvedValue(undefined),
    renameTag: vi.fn().mockResolvedValue(undefined),
  } as any
}

async function openReview(container: Element) {
  const fab = container.querySelector(
    'button[title="打开拾光 · 全屏回顾（可拖动到任意边缘）"]',
  ) as HTMLElement
  fireEvent.pointerDown(fab, { pointerId: 1, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(fab, { pointerId: 1, clientX: 10, clientY: 10 })
}

describe('App — ReviewRoom detail selection', () => {
  afterEach(cleanup)

  test('clicking a new gleam card keeps that gleam open (no auto-switch to latest)', async () => {
    const sync = makeFakeSync()
    const repo = makeFakeRepo()
    const shadowHost = document.createElement('div')
    const { container, getByText, getAllByText } = render(
      <App repository={repo} syncService={sync} shadowHost={shadowHost} />,
    )

    // 1. Open the full-screen review room.
    await openReview(container)
    await waitFor(() => expect(getByText('Latest insight about the new design')).toBeTruthy())
    expect(getByText('Older insight about the legacy system')).toBeTruthy()

    // 2. Click the latest card (g1) first — it becomes the viewed gleam.
    fireEvent.click(getByText('Latest insight about the new design'))
    await waitFor(() =>
      expect(getAllByText('Latest insight about the new design').length).toBeGreaterThan(1),
    )

    // 3. Now click the OLDER card (g2). The detail MUST stay on g2 —
    //    it must NOT auto-switch back to the previously-viewed latest (g1).
    fireEvent.click(getByText('Older insight about the legacy system'))
    await waitFor(() => expect(getAllByText('Latest insight about the new design')).toHaveLength(1))
    // And the detail should now be showing the older gleam's thought.
    expect(getAllByText('Older insight about the legacy system').length).toBeGreaterThan(1)
  })
})
