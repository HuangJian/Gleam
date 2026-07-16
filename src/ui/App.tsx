import { useState, useEffect } from 'preact/hooks'
import { Gleam } from '../domain/gleam'
import { IRepository } from '../domain/repository'
import { CaptureService } from '../services/capture'
import { TimelineService, TimelineGroup } from '../services/timeline'
import { TagService, TagCount } from '../services/tag'
import { CaptureTrigger } from './components/CaptureTrigger'
import { CapturePanel } from './components/CapturePanel'
import { ReviewRoom } from './components/ReviewRoom'
import { ReviewFAB } from './components/ReviewFAB'
import { SourceMedia } from '../domain/gleam'

interface AppProps {
  repository: IRepository
  shadowHost: HTMLElement
}

export function App({ repository, shadowHost }: AppProps) {
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

  const captureService = new CaptureService(repository)
  const timelineService = new TimelineService(repository)
  const tagService = new TagService(repository)

  // Load and refresh timeline
  const refreshTimeline = async (query = searchQuery) => {
    const groups = await timelineService.getTimeline(query)
    setTimelineGroups(groups)
  }

  // Refresh the global tag vocabulary (counts) after any tag mutation.
  const refreshTags = async () => {
    setTagCounts(await tagService.getAllTagCounts())
  }

  useEffect(() => {
    refreshTags()
  }, [])

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
    await timelineService.recordRevisit(id)
    // Don't full refresh to avoid scroll jump, just update count locally or refresh quietly
    await refreshTimeline()
  }

  const handleAddTag = async (gleamId: string, tag: string) => {
    const gleam = await repository.getById(gleamId)
    if (!gleam) return
    const next = Array.from(new Set([...(gleam.tags ?? []), tag]))
    await repository.updateDerivedFields(gleamId, { tags: next })
    setViewingGleam({ ...gleam, tags: next })
    await refreshTimeline()
    await refreshTags()
  }

  const handleRemoveTag = async (gleamId: string, tag: string) => {
    const gleam = await repository.getById(gleamId)
    if (!gleam) return
    const next = (gleam.tags ?? []).filter((t) => t !== tag)
    await repository.updateDerivedFields(gleamId, { tags: next })
    setViewingGleam({ ...gleam, tags: next })
    await refreshTimeline()
    await refreshTags()
  }

  const handleExportData = async () => {
    try {
      const allGleams = await repository.getAll()
      const dataStr = JSON.stringify(allGleams, null, 2)
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
      />
    </>
  )
}
