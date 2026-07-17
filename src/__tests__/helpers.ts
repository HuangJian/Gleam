import type { Gleam } from '../domain/gleam'

/** Factory for test Gleam objects. Pass overrides to customize any field. */
export function makeGleam(overrides: Partial<Gleam> = {}): Gleam {
  return {
    id: 'gleam-001',
    thought: 'A flash of understanding.',
    source: {
      type: 'url',
      url: 'https://example.com/article',
      title: 'Example Article',
      excerpt: '',
    },
    createdAt: '2026-07-14T10:00:00.000Z',
    tags: [],
    revisitCount: 0,
    lastRevisitedAt: '',
    ...overrides,
  }
}
