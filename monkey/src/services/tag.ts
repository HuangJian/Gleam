import type { GleamWithIntelligence } from '../domain/intelligence'

export interface TagCount {
  tag: string
  count: number
}

/**
 * Computes tag counts from a list of gleams.
 * Returns all distinct tags with their usage counts, sorted by count
 * descending then name ascending.
 *
 * This is a pure utility — the caller provides the gleams (e.g., from
 * SyncService.getTimeline or the current timeline groups).
 */
export function countTags(items: GleamWithIntelligence[]): TagCount[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const tag of item.gleam.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
