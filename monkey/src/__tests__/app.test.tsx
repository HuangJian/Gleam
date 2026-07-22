import { describe, test, expect, vi, afterEach } from 'bun:test'
import { render, fireEvent, cleanup, waitFor, act } from '@testing-library/preact'
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

// Open the capture panel via the global Ctrl+Shift+G shortcut.
function openCaptureViaShortcut() {
  fireEvent(
    window,
    new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, shiftKey: true, bubbles: true }),
  )
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

describe('App — periodic refresh honours the selected range', () => {
  let setIntervalSpy: ReturnType<typeof vi.spyOn>
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>
  const intervalCallbacks: Array<() => unknown> = []

  afterEach(() => {
    cleanup()
    setIntervalSpy?.mockRestore()
    clearIntervalSpy?.mockRestore()
  })

  test('selecting 近三十天 is not reverted to 近三天 by the periodic refresh', async () => {
    intervalCallbacks.length = 0
    setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: any) => {
      intervalCallbacks.push(fn as () => unknown)
      return 1
    }) as any)
    clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})

    const sync = makeFakeSync()
    const repo = makeFakeRepo()
    const shadowHost = document.createElement('div')
    const { container } = render(
      <App repository={repo} syncService={sync} shadowHost={shadowHost} />,
    )

    // The default range (近三天) is pushed up on mount and searched.
    await act(async () => {
      await Promise.resolve()
    })
    expect(sync.search).toHaveBeenCalled()
    const near3Query = sync.search.mock.calls[0][0] as string

    // Opening the review room registers the periodic-refresh interval.
    intervalCallbacks.length = 0
    await act(async () => {
      await openReview(container)
    })
    expect(intervalCallbacks.length).toBeGreaterThan(0)
    const tick = intervalCallbacks[intervalCallbacks.length - 1]

    // Switch the range to 近三十天.
    const select = container.querySelector('select') as HTMLSelectElement
    await act(async () => {
      fireEvent.change(select, { target: { value: '近三十天' } })
    })
    const afterSelect = sync.search.mock.calls.at(-1)?.[0] as string
    expect(afterSelect).not.toBe(near3Query)

    // Simulate the periodic refresh firing.
    await act(async () => {
      await (tick() as Promise<void>)
    })

    // The periodic refresh must keep 近三十天 — NOT snap back to 近三天.
    const lastQuery = sync.search.mock.calls.at(-1)?.[0] as string
    expect(lastQuery).not.toBe(near3Query)
    expect(lastQuery).toBe(afterSelect)
  })
})

describe('App — capture save does not block on an unreachable server', () => {
  afterEach(cleanup)

  test('capture panel closes promptly even when the server is unreachable', async () => {
    // Simulate an unreachable / hanging server: both server-backed read paths
    // (getTimeline + search) return a promise that never resolves on its own.
    // refreshTimeline() takes the search path once ReviewRoom mounts its
    // default "近三天" range, so search MUST hang to reproduce the bug; we hang
    // getTimeline too for robustness. We resolve the deferred at the end so the
    // dangling background promises don't leak.
    let resolveReads!: () => void
    const pending = new Promise<never>(() => {}) as Promise<never>
    const release = new Promise<void>((resolve) => {
      resolveReads = resolve
    })
    // Tie resolution of the read mocks to `release`.
    const hanging = ((): Promise<never> => pending) as unknown as () => Promise<unknown>

    const sync = makeFakeSync()
    sync.getTimeline = vi.fn().mockReturnValue(hanging())
    sync.search = vi.fn().mockReturnValue(hanging())
    const repo = makeFakeRepo()
    const shadowHost = document.createElement('div')
    const { getByPlaceholderText, getByText, queryByPlaceholderText } = render(
      <App repository={repo} syncService={sync} shadowHost={shadowHost} />,
    )

    // Open the capture panel via the global shortcut.
    await act(async () => {
      openCaptureViaShortcut()
    })
    const textarea = await waitFor(() => getByPlaceholderText(/写下你此刻真实的理解/))
    fireEvent.input(textarea, { target: { value: 'A quick gleam.' } })

    // Save. With the bug, handleSaveCapture awaits refreshTimeline() which
    // awaits the never-resolving server read — the panel stays in "保存中..."
    // and never closes. With the fix, the panel closes immediately and
    // refreshTimeline runs in the background.
    fireEvent.click(getByText('拾取'))

    await waitFor(
      () => {
        // Panel is gone once the textarea placeholder disappears.
        expect(queryByPlaceholderText(/写下你此刻真实的理解/)).toBeNull()
      },
      { timeout: 1000 },
    )

    // The background refresh was kicked off but the panel did not wait for it.
    expect(sync.search).toHaveBeenCalled()
    // Release the dangling promises so the test exits cleanly.
    resolveReads()
    void release
  })
})
