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
