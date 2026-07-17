export type { Gleam, Source, SourceType, SourceMedia, MediaKind } from '../../shared/types'

import type { Gleam, Source } from '../../shared/types'

/**
 * Creates a new Gleam object with runtime invariants enforced.
 *
 * Core fields (id, thought, source, createdAt) are immutable after creation.
 * Derived fields (tags, revisitCount, lastRevisitedAt) are mutable and
 * initialised with sensible defaults.
 */
export function createGleam(
  id: string,
  thought: string,
  source: Source,
  createdAt?: string,
): Gleam {
  if (!thought || thought.trim() === '') {
    throw new Error('Thought cannot be empty')
  }
  if (!source.type) {
    throw new Error('Source type is required')
  }

  return {
    id,
    thought: thought.trim(),
    source: {
      type: source.type,
      url: source.url ?? '',
      title: source.title ?? '',
      excerpt: source.excerpt?.trim() ?? '',
      media: source.media,
    },
    createdAt: createdAt || new Date().toISOString(),
    tags: [],
    revisitCount: 0,
    lastRevisitedAt: '',
  }
}
