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

  test('search returns gleams with highlights', async () => {
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
    expect(result.items[0].gleam.id).toBe('g1')
    expect(result.items[0].gleam.source.type).toBe('url') // lowercase
    expect(result.items[0].gleam.lastRevisitedAt).toBe('') // null → ''
    expect(result.items[0].highlight).toContain('**React**')
  })

  test('getTimeline returns gleams sorted by createdAt', async () => {
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
            },
          ],
          total: 1,
          hasMore: false,
        },
      },
    })

    const result = await client.getTimeline({ limit: 10 })
    expect(result.total).toBe(1)
    expect(result.items[0].source.type).toBe('book') // lowercase
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
})
