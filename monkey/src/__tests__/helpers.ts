import type { Gleam } from '../domain/gleam'
import type {
  GleamIntelligence,
  GleamRelation,
  GleamWithIntelligence,
} from '../domain/intelligence'

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

/** Factory for test GleamIntelligence objects. */
export function makeIntelligence(overrides: Partial<GleamIntelligence> = {}): GleamIntelligence {
  return {
    summary: null,
    aiTags: [],
    ...overrides,
  }
}

/** Factory for test GleamWithIntelligence objects. */
export function makeGleamWithIntelligence(
  gleamOverrides: Partial<Gleam> = {},
  intelligenceOverrides: Partial<GleamIntelligence> = {},
): GleamWithIntelligence {
  return {
    gleam: makeGleam(gleamOverrides),
    intelligence: makeIntelligence(intelligenceOverrides),
  }
}

/** Factory for test GleamRelation objects. */
export function makeRelation(overrides: Partial<GleamRelation> = {}): GleamRelation {
  return {
    id: 'rel-001',
    targetGleam: {
      id: 'gleam-002',
      thought: 'A related thought.',
      createdAt: '2026-07-14T12:00:00.000Z',
    },
    relationType: 'semantic_proximity',
    strength: 0.87,
    origin: 'ai',
    ...overrides,
  }
}
