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
    },
    created_at: '2026-07-14T10:00:00.000Z',
    revisit_count: 0,
    ...overrides,
  }
}
