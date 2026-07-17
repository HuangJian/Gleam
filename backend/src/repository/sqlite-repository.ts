import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import type { DB } from '../database'
import type { Database } from 'bun:sqlite'
import { gleams, gleamDerived } from '../database/schema'
import type { Gleam, GleamDerived, Source } from '../domain/gleam'
import { validateUuidV7 } from '../util/uuid'
import type {
  AppendError,
  AppendResult,
  IRepository,
  SearchHit,
  SearchResult,
  TimelineOptions,
  TimelineResult,
} from './repository'
import { generateHighlight } from '../search/highlight'
import { tokenize } from '../search/tokenizer'

const MAX_BATCH_SIZE = 100

export class SqliteRepository implements IRepository {
  private readonly db: DB
  private readonly sqlite: Database

  constructor(db: DB, sqlite: Database) {
    this.db = db
    this.sqlite = sqlite
  }

  // ── Append (core + derived) ──────────────────────────

  async appendGleams(
    inputGleams: Gleam[],
    _source: 'CAPTURE' | 'IMPORT' = 'CAPTURE',
  ): Promise<AppendResult> {
    if (inputGleams.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE}`)
    }

    let accepted = 0
    let skipped = 0
    let rejected = 0
    const errors: AppendError[] = []

    const tx = this.sqlite.transaction(() => {
      for (const gleam of inputGleams) {
        try {
          validateUuidV7(gleam.id)

          const existing = this.db
            .select({ id: gleams.id })
            .from(gleams)
            .where(eq(gleams.id, gleam.id))
            .get()

          const content = JSON.stringify(gleam)
          const sourceJson = JSON.stringify(gleam.source)
          const receivedAt = new Date().toISOString()

          if (existing) {
            skipped++
            this.upsertDerived(gleam.id, {
              tags: gleam.tags,
              revisitCount: gleam.revisitCount,
              lastRevisitedAt: gleam.lastRevisitedAt,
            })
            this.refreshFts(gleam.id, gleam.thought, gleam.source, gleam.tags)
          } else {
            this.db
              .insert(gleams)
              .values({
                id: gleam.id,
                createdAt: gleam.createdAt,
                thought: gleam.thought,
                source: sourceJson,
                content,
                receivedAt,
              })
              .run()

            this.db
              .insert(gleamDerived)
              .values({
                gleamId: gleam.id,
                tags: JSON.stringify(gleam.tags),
                revisitCount: gleam.revisitCount,
                lastRevisitedAt: gleam.lastRevisitedAt,
              })
              .run()

            accepted++
            this.refreshFts(gleam.id, gleam.thought, gleam.source, gleam.tags)
          }
        } catch (e) {
          rejected++
          errors.push({
            id: gleam.id ?? null,
            message: e instanceof Error ? e.message : String(e),
          })
        }
      }
    })

    tx()
    return { accepted, skipped, rejected, errors }
  }

  // ── Derived sync ─────────────────────────────────────

  async updateGleamDerivedFields(
    gleamId: string,
    updates: Partial<GleamDerived>,
  ): Promise<{ gleamId: string; success: boolean }> {
    const existing = this.db
      .select({ id: gleams.id, thought: gleams.thought, source: gleams.source })
      .from(gleams)
      .where(eq(gleams.id, gleamId))
      .get()

    if (!existing) {
      return { gleamId, success: false }
    }

    const current = this.db
      .select()
      .from(gleamDerived)
      .where(eq(gleamDerived.gleamId, gleamId))
      .get()

    const nextTags = updates.tags ?? (current ? (JSON.parse(current.tags) as string[]) : [])
    const nextRevisitCount = updates.revisitCount ?? current?.revisitCount ?? 0
    const nextLastRevisitedAt = updates.lastRevisitedAt ?? current?.lastRevisitedAt ?? ''

    this.db
      .insert(gleamDerived)
      .values({
        gleamId,
        tags: JSON.stringify(nextTags),
        revisitCount: nextRevisitCount,
        lastRevisitedAt: nextLastRevisitedAt,
      })
      .onConflictDoUpdate({
        target: gleamDerived.gleamId,
        set: {
          tags: JSON.stringify(nextTags),
          revisitCount: nextRevisitCount,
          lastRevisitedAt: nextLastRevisitedAt,
        },
      })
      .run()

    const source = JSON.parse(existing.source) as Source
    this.refreshFts(gleamId, existing.thought, source, nextTags)

    return { gleamId, success: true }
  }

  // ── Tag rename ───────────────────────────────────────

  async renameTag(oldTag: string, newTag: string): Promise<{ affectedCount: number }> {
    const normalizedOld = oldTag.trim()
    const normalizedNew = newTag.trim()
    if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) {
      return { affectedCount: 0 }
    }

    let affectedCount = 0
    const tx = this.sqlite.transaction(() => {
      const allDerived = this.db.select().from(gleamDerived).all()
      for (const row of allDerived) {
        const tags: string[] = JSON.parse(row.tags)
        if (!tags.includes(normalizedOld)) continue
        const next = Array.from(
          new Set(tags.filter((t) => t !== normalizedOld).concat(normalizedNew)),
        )
        this.db
          .update(gleamDerived)
          .set({ tags: JSON.stringify(next) })
          .where(eq(gleamDerived.gleamId, row.gleamId))
          .run()

        const core = this.db
          .select({ thought: gleams.thought, source: gleams.source })
          .from(gleams)
          .where(eq(gleams.id, row.gleamId))
          .get()
        if (core) {
          const source = JSON.parse(core.source) as Source
          this.refreshFts(row.gleamId, core.thought, source, next)
        }
        affectedCount++
      }
    })
    tx()
    return { affectedCount }
  }

  // ── Timeline ─────────────────────────────────────────

  async getTimeline(options: TimelineOptions): Promise<TimelineResult> {
    const limit = options.limit ?? 50
    const offset = options.offset ?? 0

    const conditions = []
    if (options.from) {
      conditions.push(gte(gleams.createdAt, options.from))
    }
    if (options.to) {
      conditions.push(lte(gleams.createdAt, options.to))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const totalResult = this.db
      .select({ count: sql<number>`count(*)` })
      .from(gleams)
      .where(whereClause)
      .get()
    const total = totalResult?.count ?? 0

    const rows = this.db
      .select()
      .from(gleams)
      .where(whereClause)
      .orderBy(desc(gleams.createdAt))
      .limit(limit)
      .offset(offset)
      .all()

    const items = rows.map((row) => this.joinGleam(row))
    const hasMore = offset + items.length < total

    return { items, total, hasMore }
  }

  // ── Search ───────────────────────────────────────────

  async search(query: string, limit: number = 20, offset: number = 0): Promise<SearchResult> {
    const tokens = tokenize(query)
    if (tokens.length === 0) {
      return { total: 0, items: [] }
    }

    const ftsQuery = tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ')

    const WEIGHTS = { thought: 10, sourceTitle: 6, tags: 4, sourceExcerpt: 2, sourceUrl: 1 }

    const rows = this.sqlite
      .prepare(
        `SELECT
           f.gleam_id,
           f.thought,
           f.source_title,
           f.source_excerpt,
           f.source_url,
           f.tags,
           rank
         FROM gleams_fts f
         WHERE gleams_fts MATCH ?
         ORDER BY rank
         LIMIT ? OFFSET ?`,
      )
      .all(ftsQuery, limit, offset) as FtsRow[]

    const totalRow = this.sqlite
      .prepare(`SELECT count(*) as count FROM gleams_fts WHERE gleams_fts MATCH ?`)
      .get(ftsQuery) as { count: number }

    const hits: SearchHit[] = []
    for (const row of rows) {
      const core = this.db.select().from(gleams).where(eq(gleams.id, row.gleam_id)).get()
      if (!core) continue

      const derived = this.db
        .select()
        .from(gleamDerived)
        .where(eq(gleamDerived.gleamId, row.gleam_id))
        .get()

      const source = JSON.parse(core.source) as Source
      const tags = derived ? (JSON.parse(derived.tags) as string[]) : []

      const gleam: Gleam = {
        id: core.id,
        thought: core.thought,
        source,
        createdAt: core.createdAt,
        tags,
        revisitCount: derived?.revisitCount ?? 0,
        lastRevisitedAt: derived?.lastRevisitedAt ?? '',
      }

      const score = computeScore(row, WEIGHTS)
      const highlight = generateHighlight(query, [
        { text: core.thought, weight: WEIGHTS.thought },
        { text: source.title, weight: WEIGHTS.sourceTitle },
        { text: tags.join(' '), weight: WEIGHTS.tags },
        { text: source.excerpt, weight: WEIGHTS.sourceExcerpt },
      ])

      hits.push({ gleam, score, highlight })
    }

    return { total: totalRow.count, items: hits }
  }

  // ── Single gleam ─────────────────────────────────────

  async getGleamById(id: string): Promise<Gleam | null> {
    const row = this.db.select().from(gleams).where(eq(gleams.id, id)).get()
    if (!row) return null
    return this.joinGleam(row)
  }

  // ── Helpers ──────────────────────────────────────────

  private joinGleam(row: typeof gleams.$inferSelect): Gleam {
    const source = JSON.parse(row.source) as Source
    const derived = this.db
      .select()
      .from(gleamDerived)
      .where(eq(gleamDerived.gleamId, row.id))
      .get()

    return {
      id: row.id,
      thought: row.thought,
      source,
      createdAt: row.createdAt,
      tags: derived ? (JSON.parse(derived.tags) as string[]) : [],
      revisitCount: derived?.revisitCount ?? 0,
      lastRevisitedAt: derived?.lastRevisitedAt ?? '',
    }
  }

  private upsertDerived(gleamId: string, derived: GleamDerived): void {
    this.db
      .insert(gleamDerived)
      .values({
        gleamId,
        tags: JSON.stringify(derived.tags),
        revisitCount: derived.revisitCount,
        lastRevisitedAt: derived.lastRevisitedAt,
      })
      .onConflictDoUpdate({
        target: gleamDerived.gleamId,
        set: {
          tags: JSON.stringify(derived.tags),
          revisitCount: derived.revisitCount,
          lastRevisitedAt: derived.lastRevisitedAt,
        },
      })
      .run()
  }

  private refreshFts(gleamId: string, thought: string, source: Source, tags: string[]): void {
    this.sqlite.prepare(`DELETE FROM gleams_fts WHERE gleam_id = ?`).run(gleamId)
    this.sqlite
      .prepare(
        `INSERT INTO gleams_fts (gleam_id, thought, source_title, source_excerpt, source_url, tags)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        gleamId,
        thought,
        source.title ?? '',
        source.excerpt ?? '',
        source.url ?? '',
        tags.join(' '),
      )
  }
}

// ── FTS row type ────────────────────────────────────────

interface FtsRow {
  gleam_id: string
  thought: string
  source_title: string
  source_excerpt: string
  source_url: string
  tags: string
  rank: number
}

// ── Score computation ───────────────────────────────────

function computeScore(
  row: FtsRow,
  weights: {
    thought: number
    sourceTitle: number
    tags: number
    sourceExcerpt: number
    sourceUrl: number
  },
): number {
  const ftsScore = 1 / (1 + Math.abs(row.rank))
  const fieldBonus =
    (row.thought ? weights.thought : 0) +
    (row.source_title ? weights.sourceTitle : 0) +
    (row.tags ? weights.tags : 0) +
    (row.source_excerpt ? weights.sourceExcerpt : 0) +
    (row.source_url ? weights.sourceUrl : 0)
  return ftsScore * fieldBonus
}
