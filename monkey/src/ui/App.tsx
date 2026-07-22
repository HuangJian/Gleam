import { useState, useEffect, useRef } from 'preact/hooks'
import { SourceMedia } from '../domain/gleam'
import type { GleamWithIntelligence } from '../domain/intelligence'
import { IRepository } from '../domain/repository'
import { CaptureService } from '../services/capture'
import { groupByDate, TimelineGroup } from '../services/timeline'
import { countTags, TagCount } from '../services/tag'
import { SyncService, SyncState } from '../services/sync'
import { getServerConfig, setServerUrl } from '../infra/server-config'
import { CaptureTrigger } from './components/CaptureTrigger'
import { CapturePanel } from './components/CapturePanel'
import { ReviewRoom } from './components/ReviewRoom'
import { ReviewFAB } from './components/ReviewFAB'
import { SettingsPanel } from './components/SettingsPanel'

interface AppProps {
  repository: IRepository
  syncService: SyncService
  shadowHost: HTMLElement
}

export function App({ repository, syncService, shadowHost }: AppProps) {
  const [isCaptureOpen, setIsCaptureOpen] = useState(false)
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [activeExcerptText, setActiveExcerptText] = useState('')
  const [activeExcerptHtml, setActiveExcerptHtml] = useState('')
  const [activeExcerptFullHtml, setActiveExcerptFullHtml] = useState<string | null>(null)
  const [activeExcerptFullTag, setActiveExcerptFullTag] = useState<string | null>(null)
  const [activeMedia, setActiveMedia] = useState<SourceMedia | undefined>(undefined)
  const [timelineGroups, setTimelineGroups] = useState<TimelineGroup[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [viewingGleam, setViewingGleam] = useState<GleamWithIntelligence | null>(null)
  const [tagCounts, setTagCounts] = useState<TagCount[]>([])
  const [syncState, setSyncState] = useState<SyncState>(syncService.getState())
  const [highlights, setHighlights] = useState<Record<string, string | null>>({})
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const captureService = new CaptureService(repository)

  // Subscribe to sync state updates
  useEffect(() => {
    const unsub = syncService.subscribe(setSyncState)
    return unsub
  }, [])

  // Load timeline (and tag counts when unfiltered)
  const refreshTimeline = async (query = searchQuery) => {
    let items: GleamWithIntelligence[]
    const newHighlights: Record<string, string | null> = {}
    if (query && query.trim() !== '') {
      const result = await syncService.search(query)
      items = result.items.map((h) => {
        newHighlights[h.item.gleam.id] = h.highlight
        return h.item
      })
      setHighlights(newHighlights)
    } else {
      const result = await syncService.getTimeline()
      items = result.items
      setHighlights({})
      // Recompute tag counts from the full (unfiltered) timeline
      setTagCounts(countTags(items))
    }
    setTimelineGroups(groupByDate(items))

    // Refresh viewingGleam's intelligence from the new timeline data.
    // Use the functional updater so we always re-find by the *current*
    // id rather than a stale closure value. A stale `viewingGleam`
    // here would clobber the just-opened gleam: e.g. clicking an
    // older card while the latest is open would snap the detail back to
    // the previously-viewed (latest) gleam.
    setViewingGleam((prev) => {
      if (!prev) return prev
      const updated = items.find((i) => i.gleam.id === prev.gleam.id)
      return updated ?? prev
    })
  }

  useEffect(() => {
    refreshTimeline()
  }, [searchQuery])

  // Periodic refresh: pick up new AI artifacts while ReviewRoom is open.
  // `refreshTimeline` closes over `searchQuery`; the interval effect only
  // re-subscribes when `isReviewOpen` flips, so it would otherwise capture a
  // stale `refreshTimeline` and silently revert the list back to the default
  // range (近三天) ~30s after the user picks a different one. A ref keeps the
  // interval pointed at the latest `refreshTimeline` (and thus the current
  // query) on every tick.
  const refreshTimelineRef = useRef(refreshTimeline)
  refreshTimelineRef.current = refreshTimeline

  useEffect(() => {
    if (!isReviewOpen) return
    const interval = setInterval(() => {
      refreshTimelineRef.current()
    }, 30_000)
    return () => clearInterval(interval)
  }, [isReviewOpen])

  // Handle global shortcuts: Ctrl+Shift+G or Cmd+Shift+G to trigger quick capture
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isG = e.key.toLowerCase() === 'g'
      const isModifier = e.ctrlKey || e.metaKey
      const isShift = e.shiftKey

      if (isModifier && isShift && isG) {
        e.preventDefault()
        setViewingGleam(null)
        setActiveExcerptText('')
        setIsCaptureOpen(true)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  const handleTriggerCapture = (payload: {
    text: string
    excerptHtml: string
    excerptFullHtml: string | null
    excerptFullTag: string | null
    media?: SourceMedia
  }) => {
    setViewingGleam(null)
    setActiveExcerptText(payload.text)
    setActiveExcerptHtml(payload.excerptHtml)
    setActiveExcerptFullHtml(payload.excerptFullHtml)
    setActiveExcerptFullTag(payload.excerptFullTag)
    setActiveMedia(payload.media)
    setIsCaptureOpen(true)
  }

  const handleSaveCapture = async (thought: string, sourceExcerpt?: string) => {
    const excerpt = sourceExcerpt ?? activeExcerptText
    await captureService.capture(
      thought,
      excerpt || undefined,
      activeMedia ? { media: activeMedia, url: activeMedia.src, title: document.title } : undefined,
    )
    // Trigger async upload to server (non-blocking — falls back to local on failure)
    await syncService.onGleamCaptured()

    // Close the panel immediately. The captured gleam already lives in the
    // local cache, so refreshTimeline() can run in the background: it will
    // pick up the new gleam from the remote timeline (if reachable) or fall
    // back to local — either way without making the user wait on a
    // possibly-unreachable server. Awaiting refreshTimeline() here previously
    // blocked the panel close for seconds when the server was down.
    setIsCaptureOpen(false)
    setActiveExcerptText('')
    setActiveExcerptHtml('')
    setActiveExcerptFullHtml(null)
    setActiveExcerptFullTag(null)
    setActiveMedia(undefined)
    void refreshTimeline()
  }

  const handleAddGleam = () => {
    setViewingGleam(null)
    setActiveExcerptText('')
    setActiveExcerptHtml('')
    setActiveExcerptFullHtml(null)
    setActiveExcerptFullTag(null)
    setActiveMedia(undefined)
    setIsCaptureOpen(true)
  }

  const handleViewGleam = (item: GleamWithIntelligence) => {
    setViewingGleam(item)
  }

  const handleRevisitGleam = async (id: string) => {
    // Find the gleam in current timeline to read the current revisit count
    const current = timelineGroups.flatMap((g) => g.gleams).find((g) => g.gleam.id === id)
    if (!current) return
    const nextCount = current.gleam.revisitCount + 1
    await syncService.updateDerivedFields(id, {
      revisitCount: nextCount,
      lastRevisitedAt: new Date().toISOString(),
    })
    setViewingGleam({
      gleam: { ...current.gleam, revisitCount: nextCount },
      intelligence: current.intelligence,
    })
    await refreshTimeline()
  }

  const handleAddTag = async (gleamId: string, tag: string) => {
    const current =
      viewingGleam ?? timelineGroups.flatMap((g) => g.gleams).find((g) => g.gleam.id === gleamId)
    if (!current) return
    const next = Array.from(new Set([...current.gleam.tags, tag]))
    await syncService.updateDerivedFields(gleamId, { tags: next })
    setViewingGleam({
      gleam: { ...current.gleam, tags: next },
      intelligence: current.intelligence,
    })
    await refreshTimeline()
  }

  const handleRemoveTag = async (gleamId: string, tag: string) => {
    const current =
      viewingGleam ?? timelineGroups.flatMap((g) => g.gleams).find((g) => g.gleam.id === gleamId)
    if (!current) return
    await syncService.removeTag(gleamId, tag)
    setViewingGleam({
      gleam: { ...current.gleam, tags: current.gleam.tags.filter((t) => t !== tag) },
      intelligence: current.intelligence,
    })
    await refreshTimeline()
  }

  const handleExportData = async () => {
    try {
      const result = await syncService.getTimeline({ limit: 10000 })
      const dataStr = JSON.stringify(
        result.items.map((i) => i.gleam),
        null,
        2,
      )
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)

      const exportFileDefaultName = `gleam_export_${new Date().toISOString().slice(0, 10)}.json`

      const linkElement = document.createElement('a')
      linkElement.setAttribute('href', dataUri)
      linkElement.setAttribute('download', exportFileDefaultName)
      linkElement.click()
    } catch (e) {
      console.error('Failed to export data:', e)
      alert('数据导出失败')
    }
  }

  const handleCloseCapture = () => {
    setIsCaptureOpen(false)
    setActiveExcerptText('')
    setActiveExcerptHtml('')
    setActiveExcerptFullHtml(null)
    setActiveExcerptFullTag(null)
    setViewingGleam(null)
  }

  return (
    <>
      {/* Floating trigger for text selections */}
      <CaptureTrigger onTrigger={handleTriggerCapture} shadowHost={shadowHost} />

      {/* Floating Action Button (FAB) to open the full-screen review — draggable, snaps to edge */}
      {!isReviewOpen && <ReviewFAB onClick={() => setIsReviewOpen(true)} />}

      {/* Capture Panel Modal */}
      {isCaptureOpen && (
        <CapturePanel
          media={activeMedia}
          excerptText={activeExcerptText}
          excerptHtml={activeExcerptHtml}
          excerptFullHtml={activeExcerptFullHtml}
          excerptFullTag={activeExcerptFullTag}
          onSave={handleSaveCapture}
          onClose={handleCloseCapture}
        />
      )}

      {/* Full-screen Review Room */}
      <ReviewRoom
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        timelineGroups={timelineGroups}
        onRevisitGleam={handleRevisitGleam}
        onSearch={setSearchQuery}
        onExport={handleExportData}
        onAddGleam={handleAddGleam}
        viewingGleam={viewingGleam}
        onOpenGleam={handleViewGleam}
        onGetRelations={(gleamId: string) => syncService.getGleamRelations(gleamId)}
        tagCounts={tagCounts}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        syncState={syncState}
        highlights={highlights}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRegenerateArtifact={async (
          gleamId: string,
          artifact: 'SUMMARY' | 'TAGS' | 'EMBEDDING' | 'RELATION',
        ) => {
          await syncService.regenerateArtifact(gleamId, artifact)
        }}
      />

      {/* Settings Panel Modal */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        syncState={syncState}
        serverUrl={getServerConfig().url}
        onSaveUrl={(url) => setServerUrl(url)}
        onTestConnection={() => syncService.testConnection()}
        onSyncNow={async () => {
          await syncService.syncPending()
          await refreshTimeline()
        }}
        onGetIntelligenceConfig={() => syncService.getIntelligenceConfig()}
        onConfigureProvider={(provider, model, embeddingModel, endpoint, apiKey) =>
          syncService.configureProvider(provider, model, embeddingModel, endpoint, apiKey)
        }
        onRemoveProvider={() => syncService.removeProvider()}
      />
    </>
  )
}
