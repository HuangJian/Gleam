import { useState, useEffect } from 'preact/hooks'
import { Gleam, SourceMedia } from '../domain/gleam'
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
  const [viewingGleam, setViewingGleam] = useState<Gleam | null>(null)
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
    let gleams: Gleam[]
    const newHighlights: Record<string, string | null> = {}
    if (query && query.trim() !== '') {
      const result = await syncService.search(query)
      gleams = result.items.map((h) => {
        newHighlights[h.gleam.id] = h.highlight
        return h.gleam
      })
      setHighlights(newHighlights)
    } else {
      const result = await syncService.getTimeline()
      gleams = result.items
      setHighlights({})
      // Recompute tag counts from the full (unfiltered) timeline
      setTagCounts(countTags(gleams))
    }
    setTimelineGroups(groupByDate(gleams))
  }

  useEffect(() => {
    refreshTimeline()
  }, [searchQuery])

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
    await refreshTimeline()
    setIsCaptureOpen(false)
    setActiveExcerptText('')
    setActiveExcerptHtml('')
    setActiveExcerptFullHtml(null)
    setActiveExcerptFullTag(null)
    setActiveMedia(undefined)
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

  const handleViewGleam = (gleam: Gleam) => {
    setViewingGleam(gleam)
  }

  const handleRevisitGleam = async (id: string) => {
    // Find the gleam in current timeline to read the current revisit count
    const gleam = timelineGroups.flatMap((g) => g.gleams).find((g) => g.id === id)
    if (!gleam) return
    const nextCount = gleam.revisitCount + 1
    await syncService.updateDerivedFields(id, {
      revisitCount: nextCount,
      lastRevisitedAt: new Date().toISOString(),
    })
    setViewingGleam({ ...gleam, revisitCount: nextCount })
    await refreshTimeline()
  }

  const handleAddTag = async (gleamId: string, tag: string) => {
    const gleam =
      viewingGleam ?? timelineGroups.flatMap((g) => g.gleams).find((g) => g.id === gleamId)
    if (!gleam) return
    const next = Array.from(new Set([...gleam.tags, tag]))
    await syncService.updateDerivedFields(gleamId, { tags: next })
    setViewingGleam({ ...gleam, tags: next })
    await refreshTimeline()
  }

  const handleRemoveTag = async (gleamId: string, tag: string) => {
    const gleam =
      viewingGleam ?? timelineGroups.flatMap((g) => g.gleams).find((g) => g.id === gleamId)
    if (!gleam) return
    const next = gleam.tags.filter((t) => t !== tag)
    await syncService.updateDerivedFields(gleamId, { tags: next })
    setViewingGleam({ ...gleam, tags: next })
    await refreshTimeline()
  }

  const handleExportData = async () => {
    try {
      const result = await syncService.getTimeline({ limit: 10000 })
      const dataStr = JSON.stringify(result.items, null, 2)
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
        onCloseDetail={() => setViewingGleam(null)}
        tagCounts={tagCounts}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        syncState={syncState}
        highlights={highlights}
        onOpenSettings={() => setIsSettingsOpen(true)}
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
      />
    </>
  )
}
