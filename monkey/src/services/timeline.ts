import type { GleamWithIntelligence } from '../domain/intelligence'

export interface TimelineGroup {
  dateLabel: string // e.g., "2026-07-12"
  gleams: GleamWithIntelligence[]
}

/**
 * Groups gleams by local date, newest first within each group.
 * Groups are returned in chronological order (newest date first).
 *
 * This is a pure utility — the caller is responsible for fetching gleams
 * (e.g., via SyncService.getTimeline or SyncService.search).
 */
export function groupByDate(items: GleamWithIntelligence[]): TimelineGroup[] {
  const groupsMap: Record<string, GleamWithIntelligence[]> = {}

  for (const item of items) {
    const date = new Date(item.gleam.createdAt)
    const dateLabel = formatDateLabel(date)
    if (!groupsMap[dateLabel]) {
      groupsMap[dateLabel] = []
    }
    groupsMap[dateLabel].push(item)
  }

  return Object.entries(groupsMap)
    .map(([dateLabel, groupItems]) => ({
      dateLabel,
      gleams: groupItems.sort(
        (a, b) => new Date(b.gleam.createdAt).getTime() - new Date(a.gleam.createdAt).getTime(),
      ),
    }))
    .sort((a, b) => {
      // Sort groups by date descending (parse "Today"/"Yesterday" as max/min)
      if (a.dateLabel === 'Today') return -1
      if (b.dateLabel === 'Today') return 1
      if (a.dateLabel === 'Yesterday') return -1
      if (b.dateLabel === 'Yesterday') return 1
      return b.dateLabel.localeCompare(a.dateLabel)
    })
}

function formatDateLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (isSameDay(date, today)) {
    return 'Today'
  } else if (isSameDay(date, yesterday)) {
    return 'Yesterday'
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}
