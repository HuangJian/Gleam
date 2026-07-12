export type SourceType = 'url' | 'book' | 'conversation' | 'experience' | 'thought'

export interface Source {
  type: SourceType
  url?: string
  title?: string
  excerpt?: string
}

export interface Gleam {
  // Core fields (Immutable)
  id: string // UUID v7
  thought: string // The user's understanding
  source: Source // Reconstructable context
  created_at: string // ISO 8601 string

  // Derived fields (Mutable)
  tags?: string[]
  revisit_count?: number
  last_revisited_at?: string
}

/**
 * Creates a new Gleam object with runtime invariants enforced.
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
      url: source.url,
      title: source.title,
      excerpt: source.excerpt?.trim(),
    },
    created_at: createdAt || new Date().toISOString(),
    tags: [],
    revisit_count: 0,
  }
}
