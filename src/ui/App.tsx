import { useState, useEffect } from 'preact/hooks'
import { Gleam } from '../domain/gleam'
import { IRepository } from '../domain/repository'
import { CaptureService } from '../services/capture'
import { TimelineService, TimelineGroup } from '../services/timeline'
import { CaptureTrigger } from './components/CaptureTrigger'
import { CapturePanel } from './components/CapturePanel'
import { ReviewSidebar } from './components/ReviewSidebar'
import { SidebarFAB } from './components/SidebarFAB'
import { SourceMedia } from '../domain/gleam'

interface AppProps {
  repository: IRepository
  shadowHost: HTMLElement
}

export function App({ repository, shadowHost }: AppProps) {
  const [isCaptureOpen, setIsCaptureOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [activeExcerpt, setActiveExcerpt] = useState('')
  const [activeMedia, setActiveMedia] = useState<SourceMedia | undefined>(undefined)
  const [timelineGroups, setTimelineGroups] = useState<TimelineGroup[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [viewingGleam, setViewingGleam] = useState<Gleam | null>(null)

  const captureService = new CaptureService(repository)
  const timelineService = new TimelineService(repository)

  // Load and refresh timeline
  const refreshTimeline = async (query = searchQuery) => {
    const groups = await timelineService.getTimeline(query)
    setTimelineGroups(groups)
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
        setActiveExcerpt('')
        setIsCaptureOpen(true)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  const handleTriggerCapture = (payload: { excerpt?: string; media?: SourceMedia }) => {
    setViewingGleam(null)
    setActiveExcerpt(payload.excerpt || '')
    setActiveMedia(payload.media)
    setIsCaptureOpen(true)
  }

  const handleSaveCapture = async (thought: string) => {
    await captureService.capture(
      thought,
      activeExcerpt || undefined,
      activeMedia ? { media: activeMedia, url: activeMedia.src, title: document.title } : undefined,
    )
    await refreshTimeline()
    setIsCaptureOpen(false)
    setActiveExcerpt('')
    setActiveMedia(undefined)
  }

  const handleAddGleam = () => {
    setViewingGleam(null)
    setActiveExcerpt('')
    setActiveMedia(undefined)
    setIsCaptureOpen(true)
  }

  const handleViewGleam = (gleam: Gleam) => {
    setViewingGleam(gleam)
    setIsCaptureOpen(true)
  }

  const handleRevisitGleam = async (id: string) => {
    await timelineService.recordRevisit(id)
    // Don't full refresh to avoid scroll jump, just update count locally or refresh quietly
    await refreshTimeline()
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
    setActiveExcerpt('')
    setViewingGleam(null)
  }

  return (
    <>
      {/* Floating trigger for text selections */}
      <CaptureTrigger onTrigger={handleTriggerCapture} shadowHost={shadowHost} />

      {/* Floating Action Button (FAB) to open sidebar — draggable, snaps to edge */}
      {!isSidebarOpen && <SidebarFAB onClick={() => setIsSidebarOpen(true)} />}

      {/* Capture Panel Modal */}
      {isCaptureOpen && (
        <CapturePanel
          media={viewingGleam?.source.media || activeMedia}
          excerpt={viewingGleam?.source.excerpt || activeExcerpt || undefined}
          initialThought={viewingGleam?.thought || ''}
          readOnly={!!viewingGleam}
          createdAt={viewingGleam?.created_at}
          onSave={viewingGleam ? undefined : handleSaveCapture}
          onClose={handleCloseCapture}
        />
      )}

      {/* Timeline Review Sidebar */}
      <ReviewSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        timelineGroups={timelineGroups}
        onClickGleam={handleViewGleam}
        onRevisitGleam={handleRevisitGleam}
        onSearch={setSearchQuery}
        onExport={handleExportData}
        onAddGleam={handleAddGleam}
      />
    </>
  )
}
