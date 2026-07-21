import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ServerClient } from '../infra/server-client'
import type { Gleam } from '../domain/gleam'

// ── GM_xmlhttpRequest mock ─────────────────────────────

interface GMXHRCall {
  method: string
  url: string
  headers?: Record<string, string>
  data?: string
  onload?: (resp: { responseText: string; status: number; statusText: string }) => void
  onerror?: (error: unknown) => void
  ontimeout?: () => void
}

let lastCall: GMXHRCall | null = null
let mockResponse: { status: number; body: unknown } | null = null
let mockMode: 'respond' | 'error' | 'timeout' = 'respond'

beforeEach(() => {
  lastCall = null
  mockResponse = null
  mockMode = 'respond'
  ;(globalThis as unknown as Record<string, unknown>).GM_xmlhttpRequest = (details: GMXHRCall) => {
    lastCall = details
    if (mockMode === 'error') {
      details.onerror?.(new Error('Network error'))
      return
    }
    if (mockMode === 'timeout') {
      details.ontimeout?.()
      return
    }
    if (mockResponse && details.onload) {
      details.onload({
        responseText: JSON.stringify(mockResponse.body),
        status: mockResponse.status,
        statusText: mockResponse.status === 200 ? 'OK' : 'Error',
      })
    }
  }
})

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).GM_xmlhttpRequest
})

function setMockResponse(status: number, body: unknown): void {
  mockResponse = { status, body }
}

function setMockError(): void {
  mockMode = 'error'
}

function setMockTimeout(): void {
  mockMode = 'timeout'
}

function makeGleam(overrides: Partial<Gleam> = {}): Gleam {
  return {
    id: '01978a3e-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    thought: 'A flash of understanding.',
    source: {
      type: 'url',
      url: 'https://example.com/article',
      title: 'Example Article',
      excerpt: '',
    },
    createdAt: '2026-07-14T10:00:00.000Z',
    tags: ['insight'],
    revisitCount: 0,
    lastRevisitedAt: '',
    ...overrides,
  }
}

const client = new ServerClient(() => ({ url: 'http://localhost:3000/graphql' }))

// ── Tests ──────────────────────────────────────────────

describe('ServerClient', () => {
  test('ping returns true on successful response', async () => {
    setMockResponse(200, { data: { timeline: { total: 5 } } })
    const result = await client.ping()
    expect(result).toBe(true)
  })

  test('ping returns false on network error', async () => {
    setMockError()
    const result = await client.ping()
    expect(result).toBe(false)
  })

  test('ping returns false on HTTP error', async () => {
    setMockResponse(500, { errors: [{ message: 'Internal error' }] })
    const result = await client.ping()
    expect(result).toBe(false)
  })

  test('appendGleams sends correct mutation and returns result', async () => {
    const gleam = makeGleam()
    setMockResponse(200, {
      data: {
        appendGleams: { accepted: 1, skipped: 0, rejected: 0, errors: [] },
      },
    })

    const result = await client.appendGleams([gleam])
    expect(result.accepted).toBe(1)
    expect(result.skipped).toBe(0)

    // Verify the request body contains uppercase enum values
    expect(lastCall).not.toBeNull()
    const body = JSON.parse(lastCall!.data!)
    expect(body.query).toContain('appendGleams')
    expect(body.variables.gleams[0].source.type).toBe('URL') // uppercase
    expect(body.variables.gleams[0].lastRevisitedAt).toBeNull() // '' → null
  })

  test('appendGleams handles errors in response', async () => {
    const gleam = makeGleam()
    setMockResponse(200, {
      data: {
        appendGleams: {
          accepted: 0,
          skipped: 0,
          rejected: 1,
          errors: [{ id: gleam.id, message: 'Invalid UUID' }],
        },
      },
    })

    const result = await client.appendGleams([gleam])
    expect(result.rejected).toBe(1)
    expect(result.errors[0].id).toBe(gleam.id)
    expect(result.errors[0].message).toBe('Invalid UUID')
  })

  test('search parses intelligence from wire hit.gleam into SearchHit.item', async () => {
    setMockResponse(200, {
      data: {
        search: {
          total: 1,
          items: [
            {
              gleam: {
                id: 'g1',
                thought: 'React hooks are powerful',
                source: { type: 'URL', url: 'https://react.dev', title: 'React', excerpt: '' },
                createdAt: '2026-07-14T10:00:00.000Z',
                tags: ['react'],
                revisitCount: 0,
                lastRevisitedAt: null,
                summary: 'Hooks let function components manage state.',
                aiTags: ['react', 'hooks'],
              },
              score: 1,
              highlight: '**React** hooks are powerful',
            },
          ],
        },
      },
    })

    const result = await client.search('React')
    expect(result.total).toBe(1)
    expect(result.items[0].item.gleam.id).toBe('g1')
    expect(result.items[0].item.gleam.source.type).toBe('url') // lowercase
    expect(result.items[0].item.gleam.lastRevisitedAt).toBe('') // null → ''
    expect(result.items[0].item.intelligence.summary).toBe(
      'Hooks let function components manage state.',
    )
    expect(result.items[0].item.intelligence.aiTags).toEqual(['react', 'hooks'])
    expect(result.items[0].highlight).toContain('**React**')
  })

  test('getTimeline parses intelligence into GleamWithIntelligence', async () => {
    setMockResponse(200, {
      data: {
        timeline: {
          items: [
            {
              id: 'g1',
              thought: 'First thought',
              source: { type: 'BOOK', url: '', title: 'Book', excerpt: '' },
              createdAt: '2026-07-01T10:00:00.000Z',
              tags: [],
              revisitCount: 0,
              lastRevisitedAt: null,
              summary: 'A summary of the first thought.',
              aiTags: ['book'],
            },
          ],
          total: 1,
          hasMore: false,
        },
      },
    })

    const result = await client.getTimeline({ limit: 10 })
    expect(result.total).toBe(1)
    expect(result.items[0].gleam.source.type).toBe('book') // lowercase
    expect(result.items[0].intelligence.summary).toBe('A summary of the first thought.')
    expect(result.items[0].intelligence.aiTags).toEqual(['book'])
    expect(result.hasMore).toBe(false)
  })

  test('updateDerivedFields sends correct mutation', async () => {
    setMockResponse(200, {
      data: { updateGleamDerivedFields: { gleamId: 'g1', success: true } },
    })

    const success = await client.updateDerivedFields('g1', { tags: ['new-tag'] })
    expect(success).toBe(true)

    const body = JSON.parse(lastCall!.data!)
    expect(body.variables.gleamId).toBe('g1')
    expect(body.variables.tags).toEqual(['new-tag'])
  })

  test('renameTag returns affected count', async () => {
    setMockResponse(200, {
      data: { renameTag: { affectedCount: 3 } },
    })

    const count = await client.renameTag('old', 'new')
    expect(count).toBe(3)
  })

  test('throws on HTTP error status', async () => {
    setMockResponse(500, { errors: [{ message: 'Internal server error' }] })
    await expect(client.search('test')).rejects.toThrow('HTTP 500')
  })

  test('throws on network error', async () => {
    setMockError()
    await expect(client.search('test')).rejects.toThrow('Network error')
  })

  test('throws on timeout', async () => {
    setMockTimeout()
    await expect(client.search('test')).rejects.toThrow('timeout')
  })

  test('handles media field in source conversion', async () => {
    const gleam = makeGleam({
      source: {
        type: 'url',
        url: 'https://example.com',
        title: '',
        excerpt: '',
        media: { kind: 'image', src: 'https://img.example.com/pic.jpg' },
      },
    })
    setMockResponse(200, {
      data: { appendGleams: { accepted: 1, skipped: 0, rejected: 0, errors: [] } },
    })

    await client.appendGleams([gleam])
    const body = JSON.parse(lastCall!.data!)
    expect(body.variables.gleams[0].source.media.kind).toBe('IMAGE') // uppercase
  })

  // ── Intelligence method tests ──

  test('getIntelligenceConfig returns config view', async () => {
    setMockResponse(200, {
      data: {
        intelligenceConfig: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          embeddingModel: 'text-embedding-3-small',
          endpoint: 'https://api.openai.com',
          hasApiKey: true,
        },
      },
    })

    const config = await client.getIntelligenceConfig()
    expect(config).not.toBeNull()
    expect(config!.provider).toBe('openai')
    expect(config!.model).toBe('gpt-4o-mini')
    expect(config!.hasApiKey).toBe(true)
  })

  test('getIntelligenceConfig returns null when not configured', async () => {
    setMockResponse(200, {
      data: { intelligenceConfig: null },
    })

    const config = await client.getIntelligenceConfig()
    expect(config).toBeNull()
  })

  test('configureProvider sends correct mutation', async () => {
    setMockResponse(200, {
      data: {
        configureProvider: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          embeddingModel: 'text-embedding-3-small',
          endpoint: 'https://api.openai.com',
          success: true,
        },
      },
    })

    const result = await client.configureProvider(
      'openai',
      'gpt-4o-mini',
      'text-embedding-3-small',
      'https://api.openai.com',
      'sk-xxx',
    )
    expect(result.provider).toBe('openai')
    expect(result.model).toBe('gpt-4o-mini')
    expect(result.success).toBe(true)

    const body = JSON.parse(lastCall!.data!)
    expect(body.query).toContain('configureProvider')
    expect(body.variables.provider).toBe('openai')
    expect(body.variables.model).toBe('gpt-4o-mini')
    expect(body.variables.embeddingModel).toBe('text-embedding-3-small')
    expect(body.variables.endpoint).toBe('https://api.openai.com')
    expect(body.variables.apiKey).toBe('sk-xxx')
  })

  test('removeProvider sends correct mutation', async () => {
    setMockResponse(200, {
      data: { removeProvider: { success: true } },
    })

    const success = await client.removeProvider()
    expect(success).toBe(true)

    const body = JSON.parse(lastCall!.data!)
    expect(body.query).toContain('removeProvider')
  })

  test('removeTag sends correct mutation with gleamId and tag', async () => {
    setMockResponse(200, {
      data: { removeTag: { gleamId: 'g1', success: true } },
    })

    const success = await client.removeTag('g1', 'react')
    expect(success).toBe(true)

    const body = JSON.parse(lastCall!.data!)
    expect(body.variables.gleamId).toBe('g1')
    expect(body.variables.tag).toBe('react')
  })

  test('regenerateArtifact sends correct mutation with artifact enum', async () => {
    setMockResponse(200, {
      data: { regenerateArtifact: { gleamId: 'g1', artifact: 'SUMMARY', success: true } },
    })

    const success = await client.regenerateArtifact('g1', 'SUMMARY')
    expect(success).toBe(true)

    const body = JSON.parse(lastCall!.data!)
    expect(body.variables.gleamId).toBe('g1')
    expect(body.variables.artifact).toBe('SUMMARY')
  })

  test('getGleamRelations parses nested targetGleam correctly', async () => {
    setMockResponse(200, {
      data: {
        gleamRelations: [
          {
            id: 'rel-001',
            targetGleam: {
              id: 'g2',
              thought: 'A related thought.',
              createdAt: '2026-07-14T12:00:00.000Z',
            },
            relationType: 'semantic_proximity',
            strength: 0.87,
            origin: 'AI',
          },
        ],
      },
    })

    const relations = await client.getGleamRelations('g1')
    expect(relations).toHaveLength(1)
    expect(relations[0].id).toBe('rel-001')
    expect(relations[0].targetGleam.id).toBe('g2')
    expect(relations[0].targetGleam.thought).toBe('A related thought.')
    expect(relations[0].relationType).toBe('semantic_proximity')
    expect(relations[0].strength).toBe(0.87)
    expect(relations[0].origin).toBe('ai') // lowercase
  })

  test('getGleamRelations converts origin from USER to user', async () => {
    setMockResponse(200, {
      data: {
        gleamRelations: [
          {
            id: 'rel-002',
            targetGleam: {
              id: 'g3',
              thought: 'User relation.',
              createdAt: '2026-07-14T12:00:00.000Z',
            },
            relationType: 'manual_link',
            strength: null,
            origin: 'USER',
          },
        ],
      },
    })

    const relations = await client.getGleamRelations('g1')
    expect(relations[0].origin).toBe('user')
    expect(relations[0].strength).toBeNull()
  })

  test('getGleamRelations filters orphaned relations (targetGleam is null)', async () => {
    setMockResponse(200, {
      data: {
        gleamRelations: [
          {
            id: 'rel-001',
            targetGleam: null,
            relationType: 'semantic_proximity',
            strength: 0.5,
            origin: 'AI',
          },
          {
            id: 'rel-002',
            targetGleam: {
              id: 'g2',
              thought: 'Valid relation.',
              createdAt: '2026-07-14T12:00:00.000Z',
            },
            relationType: 'semantic_proximity',
            strength: 0.8,
            origin: 'AI',
          },
        ],
      },
    })

    const relations = await client.getGleamRelations('g1')
    expect(relations).toHaveLength(1)
    expect(relations[0].id).toBe('rel-002')
  })

  test('getGleamRelations handles empty relations', async () => {
    setMockResponse(200, {
      data: { gleamRelations: [] },
    })

    const relations = await client.getGleamRelations('g1')
    expect(relations).toEqual([])
  })
})
