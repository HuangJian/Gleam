/**
 * Pure helpers for the review UI. Kept free of Preact/Emotion imports so they
 * are trivially unit-testable.
 */

// Re-export getSourceHost from the shared query module (single source of truth).
export { getSourceHost } from '@gleam/shared/query'

/** Format an ISO timestamp for display in the review detail header. */
export function formatReviewTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Format an ISO timestamp as `YYYY-MM-DD HH:mm` (local time) for the detail header. */
export function formatDetailTime(isoString: string): string {
  const d = new Date(isoString)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}`
}

/** Format an ISO timestamp as `YYYY-MM-DD` (local time) for compact date displays. */
export function formatDetailDate(isoString: string): string {
  const d = new Date(isoString)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
