import { eq, and, gte, lte, desc, sql, ne, isNotNull } from 'drizzle-orm'
import type { DB } from '../database'
import type { Database } from 'bun:sqlite'
import {
  gleams,
  gleamDerived,
  gleamAi,
  gleamRelations,
  intelligenceConfig,
  promptHistory,
} from '../database/schema'
import type { GleamAiRow } from '../database/schema'
import type {
  ArtifactType,
  GleamAI,
  GleamRelation,
  IntelligenceConfig,
  IntelligenceConfigView,
  ObservationStatus,
  PendingArtifact,
  PromptSnapshot,
  RelationOrigin,
  RelationType,
} from '../domain/gleam-ai'
import type { Gleam, GleamDerived, Source } from '../domain/gleam'
import { validateUuidV7 } from '../util/uuid'
import type {
  AppendError,
  AppendResult,
  IIntelligenceRepository,
  IRepository,
  SearchHit,
  SearchResult,
  TimelineOptions,
  TimelineResult,
} from './repository'
import { generateHighlight } from '../search/highlight'
import { parseQuery, evaluateQuery, extractKeywords, QueryParseError } from '@gleam/shared/query'

const MAX_BATCH_SIZE = 100

// ── Status field mapping ───────────────────────────────

// Literal unions for type-safe indexing into gleam_ai rows.
// Using `keyof typeof gleamAi` is too broad (includes SQLiteTable internals).
type GleamAiStatusField = 'summaryStatus' | 'tagStatus' | 'embeddingStatus' | 'relationStatus'
type GleamAiRetryField =
  | 'summaryRetryCount'
  | 'tagRetryCount'
  | 'embeddingRetryCount'
  | 'relationRetryCount'
type GleamAiLastAttemptField =
  | 'summaryLastAttemptAt'
  | 'tagLastAttemptAt'
  | 'embeddingLastAttemptAt'
  | 'relationLastAttemptAt'

const STATUS_FIELD: Record<ArtifactType, GleamAiStatusField> = {
  summary: 'summaryStatus',
  tags: 'tagStatus',
  embedding: 'embeddingStatus',
  relation: 'relationStatus',
}

const RETRY_FIELD: Record<ArtifactType, GleamAiRetryField> = {
  summary: 'summaryRetryCount',
  tags: 'tagRetryCount',
  embedding: 'embeddingRetryCount',
  relation: 'relationRetryCount',
}

const LAST_ATTEMPT_FIELD: Record<ArtifactType, GleamAiLastAttemptField> = {
  summary: 'summaryLastAttemptAt',
  tags: 'tagLastAttemptAt',
  embedding: 'embeddingLastAttemptAt',
  relation: 'relationLastAttemptAt',
}

/** Partial update type for gleam_ai — only known columns, all optional. */
type GleamAiUpdate = Partial<GleamAiRow>

// Exponential backoff schedule (ms): 1min → 5min → 30min → 2h
const BACKOFF_SCHEDULE = [60_000, 300_000, 1_800_000, 7_200_000]

export class SqliteRepository implements IRepository, IIntelligenceRepository {
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

    const currentTags = current ? (JSON.parse(current.tags) as string[]) : []
    const currentRemoved = current ? (JSON.parse(current.removedTags) as string[]) : []
    const nextTags = updates.tags ?? currentTags
    const nextRevisitCount = updates.revisitCount ?? current?.revisitCount ?? 0
    const nextLastRevisitedAt = updates.lastRevisitedAt ?? current?.lastRevisitedAt ?? ''

    // If the user is adding a tag that was previously removed, restore it.
    const nextRemoved =
      updates.tags !== undefined
        ? currentRemoved.filter((t) => !nextTags.includes(t))
        : currentRemoved

    this.db
      .insert(gleamDerived)
      .values({
        gleamId,
        tags: JSON.stringify(nextTags),
        removedTags: JSON.stringify(nextRemoved),
        revisitCount: nextRevisitCount,
        lastRevisitedAt: nextLastRevisitedAt,
      })
      .onConflictDoUpdate({
        target: gleamDerived.gleamId,
        set: {
          tags: JSON.stringify(nextTags),
          removedTags: JSON.stringify(nextRemoved),
          revisitCount: nextRevisitCount,
          lastRevisitedAt: nextLastRevisitedAt,
        },
      })
      .run()

    const source = JSON.parse(existing.source) as Source
    this.refreshFts(gleamId, existing.thought, source, nextTags)

    return { gleamId, success: true }
  }

  // ── removeTag ────────────────────────────────────────

  async removeTag(gleamId: string, tag: string): Promise<{ gleamId: string; success: boolean }> {
    const existing = this.db
      .select({ id: gleams.id, thought: gleams.thought, source: gleams.source })
      .from(gleams)
      .where(eq(gleams.id, gleamId))
      .get()

    if (!existing) {
      return { gleamId, success: false }
    }

    const tx = this.sqlite.transaction(() => {
      const current = this.db
        .select()
        .from(gleamDerived)
        .where(eq(gleamDerived.gleamId, gleamId))
        .get()

      const currentTags = current ? (JSON.parse(current.tags) as string[]) : []
      const currentRemoved = current ? (JSON.parse(current.removedTags) as string[]) : []

      const nextTags = currentTags.filter((t) => t !== tag)
      // Record the rejection so future AI regeneration cannot resurrect it.
      const nextRemoved = currentRemoved.includes(tag) ? currentRemoved : [...currentRemoved, tag]

      this.db
        .insert(gleamDerived)
        .values({
          gleamId,
          tags: JSON.stringify(nextTags),
          removedTags: JSON.stringify(nextRemoved),
          revisitCount: current?.revisitCount ?? 0,
          lastRevisitedAt: current?.lastRevisitedAt ?? '',
        })
        .onConflictDoUpdate({
          target: gleamDerived.gleamId,
          set: {
            tags: JSON.stringify(nextTags),
            removedTags: JSON.stringify(nextRemoved),
          },
        })
        .run()

      const source = JSON.parse(existing.source) as Source
      this.refreshFts(gleamId, existing.thought, source, nextTags)
    })
    tx()

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
  //
  // Uses the shared query language (shared/query.ts) to evaluate the query
  // against all gleams in TypeScript. This supports the full query syntax
  // (#tag, domain:, date operators, boolean logic, periods) identically on
  // both client and backend.
  //
  // For Gleam's expected scale (thousands of gleams), loading all rows and
  // filtering in TS is in the millisecond range. The FTS5 index is retained
  // in the schema but not used for search — it can be re-engaged later if
  // data volume grows significantly.

  async search(query: string, limit: number = 20, offset: number = 0): Promise<SearchResult> {
    // Mirror the client's runQuery: a malformed query (e.g. a bare "#"
    // with no value) throws QueryParseError. Instead of surfacing it as a
    // hard GraphQLError, fall back to a plain free-text match over the raw
    // input so the search box never breaks.
    let ast: ReturnType<typeof parseQuery>
    try {
      ast = parseQuery(query)
    } catch (e) {
      if (e instanceof QueryParseError) {
        ast = { kind: 'keyword', value: query }
      } else {
        throw e
      }
    }
    if (!ast) {
      return { total: 0, items: [] }
    }

    // Load all gleams (join core + derived), newest first.
    const allRows = this.db.select().from(gleams).orderBy(desc(gleams.createdAt)).all()
    const allGleams = allRows.map((row) => this.joinGleam(row))

    // Filter using the shared query evaluator.
    const matched = evaluateQuery(ast, allGleams)

    const total = matched.length
    const items = matched.slice(offset, offset + limit)

    // Generate highlights from keyword nodes only (not filter values).
    const keywords = extractKeywords(ast)
    const hits: SearchHit[] = items.map((gleam) => ({
      gleam,
      score: 1,
      highlight:
        keywords.length > 0
          ? generateHighlight(keywords, [
              { text: gleam.thought, weight: 10 },
              { text: gleam.source.title, weight: 6 },
              { text: gleam.source.excerpt, weight: 2 },
            ])
          : null,
    }))

    return { total, items: hits }
  }

  // ── Single gleam ─────────────────────────────────────

  async getGleamById(id: string): Promise<Gleam | null> {
    const row = this.db.select().from(gleams).where(eq(gleams.id, id)).get()
    if (!row) return null
    return this.joinGleam(row)
  }

  // ── Intelligence: Observation lifecycle ──────────────

  async findUnobservedGleams(limit: number): Promise<string[]> {
    const rows = this.db
      .select({ id: gleams.id })
      .from(gleams)
      .leftJoin(gleamAi, eq(gleamAi.gleamId, gleams.id))
      .where(sql`${gleamAi.gleamId} IS NULL`)
      .limit(limit)
      .all()
    return rows.map((r) => r.id)
  }

  async findPendingArtifacts(limit: number): Promise<PendingArtifact[]> {
    // Load all gleam_ai rows; filter in TS for per-artifact pending/failed-retryable.
    // For the expected scale (thousands of Gleams), this is fine.
    const rows = this.db.select().from(gleamAi).all()
    const now = Date.now()
    const out: PendingArtifact[] = []

    for (const row of rows) {
      for (const artifact of ['summary', 'tags', 'embedding', 'relation'] as ArtifactType[]) {
        const status = row[STATUS_FIELD[artifact]] as ObservationStatus
        if (status === 'pending') {
          out.push({ gleamId: row.gleamId, artifact })
        } else if (status === 'failed') {
          // Retry only after backoff elapsed (or if never attempted).
          const lastAttempt = row[LAST_ATTEMPT_FIELD[artifact]] as string | null
          const retryCount = row[RETRY_FIELD[artifact]] as number
          if (retryCount >= BACKOFF_SCHEDULE.length) continue
          const backoffMs = BACKOFF_SCHEDULE[retryCount]
          const lastMs = lastAttempt ? Date.parse(lastAttempt) : 0
          if (now - lastMs >= backoffMs) {
            out.push({ gleamId: row.gleamId, artifact })
          }
        }
      }
      if (out.length >= limit) break
    }

    return out.slice(0, limit)
  }

  async createGleamAI(gleamId: string): Promise<void> {
    // Insert only if missing — idempotent across Scheduler ticks.
    const existing = this.db
      .select({ gleamId: gleamAi.gleamId })
      .from(gleamAi)
      .where(eq(gleamAi.gleamId, gleamId))
      .get()
    if (existing) return

    this.db
      .insert(gleamAi)
      .values({
        gleamId,
        updatedAt: new Date().toISOString(),
      })
      .run()
  }

  async recoverRunningObservations(): Promise<number> {
    const rows = this.db.select().from(gleamAi).all()
    let recovered = 0
    const now = new Date().toISOString()

    const tx = this.sqlite.transaction(() => {
      for (const row of rows) {
        const updates: GleamAiUpdate = {}
        for (const artifact of ['summary', 'tags', 'embedding', 'relation'] as ArtifactType[]) {
          if (row[STATUS_FIELD[artifact]] === 'running') {
            updates[STATUS_FIELD[artifact]] = 'pending'
            recovered++
          }
        }
        if (Object.keys(updates).length > 0) {
          updates.updatedAt = now
          this.db.update(gleamAi).set(updates).where(eq(gleamAi.gleamId, row.gleamId)).run()
        }
      }
    })
    tx()
    return recovered
  }

  // ── Intelligence: Artifact updates ───────────────────

  async updateSummary(
    gleamId: string,
    summary: string,
    provider: string,
    model: string,
    promptVersion: string,
  ): Promise<void> {
    const now = new Date().toISOString()
    this.db
      .update(gleamAi)
      .set({
        summary,
        provider,
        model,
        summaryVersion: promptVersion,
        summaryStatus: 'completed',
        summaryRetryCount: 0,
        summaryLastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(gleamAi.gleamId, gleamId))
      .run()
  }

  async updateTags(
    gleamId: string,
    tags: string[],
    provider: string,
    model: string,
    promptVersion: string,
  ): Promise<void> {
    const now = new Date().toISOString()
    this.db
      .update(gleamAi)
      .set({
        tags: JSON.stringify(tags),
        provider,
        model,
        tagVersion: promptVersion,
        tagStatus: 'completed',
        tagRetryCount: 0,
        tagLastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(gleamAi.gleamId, gleamId))
      .run()
  }

  async updateEmbedding(
    gleamId: string,
    embedding: Buffer,
    dimensions: number,
    provider: string,
    model: string,
  ): Promise<void> {
    const now = new Date().toISOString()
    this.db
      .update(gleamAi)
      .set({
        embedding,
        embeddingDimensions: dimensions,
        embeddingModel: model,
        provider,
        // Note: do NOT overwrite `model` (chat model) here — the embedding
        // model is tracked separately in `embeddingModel`. The chat model
        // is set by updateSummary / updateTags.
        embeddingStatus: 'completed',
        embeddingRetryCount: 0,
        embeddingLastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(gleamAi.gleamId, gleamId))
      .run()
  }

  async updateRelationObservation(
    gleamId: string,
    provider: string,
    model: string,
    promptVersion: string,
  ): Promise<void> {
    const now = new Date().toISOString()
    this.db
      .update(gleamAi)
      .set({
        provider,
        model,
        relationVersion: promptVersion,
        relationStatus: 'completed',
        relationRetryCount: 0,
        relationLastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(gleamAi.gleamId, gleamId))
      .run()
  }

  // ── Intelligence: Status management ──────────────────

  async setArtifactStatus(
    gleamId: string,
    artifact: ArtifactType,
    status: ObservationStatus,
  ): Promise<void> {
    const now = new Date().toISOString()
    const updates: GleamAiUpdate = {
      [STATUS_FIELD[artifact]]: status,
      updatedAt: now,
    }
    if (status === 'running' || status === 'failed') {
      updates[LAST_ATTEMPT_FIELD[artifact]] = now
    }
    this.db.update(gleamAi).set(updates).where(eq(gleamAi.gleamId, gleamId)).run()
  }

  async recordArtifactFailure(gleamId: string, artifact: ArtifactType): Promise<void> {
    const now = new Date().toISOString()
    const row = this.db.select().from(gleamAi).where(eq(gleamAi.gleamId, gleamId)).get()
    const currentRetry = (row?.[RETRY_FIELD[artifact]] as number) ?? 0

    this.db
      .update(gleamAi)
      .set({
        [STATUS_FIELD[artifact]]: 'failed',
        [RETRY_FIELD[artifact]]: currentRetry + 1,
        [LAST_ATTEMPT_FIELD[artifact]]: now,
        updatedAt: now,
      })
      .where(eq(gleamAi.gleamId, gleamId))
      .run()
  }

  async getGleamAI(gleamId: string): Promise<GleamAI | null> {
    const row = this.db.select().from(gleamAi).where(eq(gleamAi.gleamId, gleamId)).get()
    if (!row) return null
    return this.mapGleamAIRow(row)
  }

  async getVisibleTags(gleamId: string): Promise<{
    userTags: string[]
    aiTags: string[]
    removedTags: string[]
    visible: string[]
  }> {
    const derived = this.db
      .select()
      .from(gleamDerived)
      .where(eq(gleamDerived.gleamId, gleamId))
      .get()
    const ai = this.db
      .select({ tags: gleamAi.tags })
      .from(gleamAi)
      .where(eq(gleamAi.gleamId, gleamId))
      .get()

    const userTags = derived ? (JSON.parse(derived.tags) as string[]) : []
    const removedTags = derived ? (JSON.parse(derived.removedTags) as string[]) : []
    const aiTags = ai?.tags ? (JSON.parse(ai.tags) as string[]) : []

    const visible = Array.from(new Set([...userTags, ...aiTags])).filter(
      (t) => !removedTags.includes(t),
    )

    return { userTags, aiTags, removedTags, visible }
  }

  // ── Intelligence: Relations ──────────────────────────

  async findSimilarGleams(
    gleamId: string,
    threshold: number,
    limit: number,
  ): Promise<Array<{ gleamId: string; similarity: number }>> {
    const self = this.db
      .select({
        embedding: gleamAi.embedding,
        dimensions: gleamAi.embeddingDimensions,
        model: gleamAi.embeddingModel,
      })
      .from(gleamAi)
      .where(eq(gleamAi.gleamId, gleamId))
      .get()

    if (!self?.embedding || !self.dimensions || !self.model) return []

    const selfVec = bufferToFloat32(self.embedding as Buffer)
    if (selfVec.length === 0) return []

    const candidates = await this.getAllEmbeddings(gleamId)
    const scored: Array<{ gleamId: string; similarity: number }> = []

    for (const c of candidates) {
      if (!c.dimensions || c.dimensions !== self.dimensions || c.embeddingModel !== self.model) {
        continue
      }
      const cVec = bufferToFloat32(c.embedding)
      if (cVec.length === 0) continue
      const sim = cosineSimilarity(selfVec, cVec)
      if (sim >= threshold) {
        scored.push({ gleamId: c.gleamId, similarity: sim })
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity)
    return scored.slice(0, limit)
  }

  async replaceAIRelations(
    sourceGleamId: string,
    relations: Array<{ targetGleamId: string; strength: number }>,
  ): Promise<void> {
    const now = new Date().toISOString()
    const tx = this.sqlite.transaction(() => {
      // Delete only AI-origin relations for this source Gleam.
      this.db
        .delete(gleamRelations)
        .where(
          and(eq(gleamRelations.sourceGleamId, sourceGleamId), eq(gleamRelations.origin, 'ai')),
        )
        .run()

      // Insert new AI relations.
      for (const r of relations) {
        this.db
          .insert(gleamRelations)
          .values({
            id: crypto.randomUUID(),
            sourceGleamId,
            targetGleamId: r.targetGleamId,
            relationType: 'semantic_proximity',
            strength: r.strength,
            origin: 'ai',
            createdAt: now,
          })
          .onConflictDoNothing()
          .run()
      }
    })
    tx()
  }

  async getRelations(gleamId: string): Promise<GleamRelation[]> {
    const rows = this.db
      .select()
      .from(gleamRelations)
      .where(eq(gleamRelations.sourceGleamId, gleamId))
      .all()
    return rows.map((r) => ({
      id: r.id,
      sourceGleamId: r.sourceGleamId,
      targetGleamId: r.targetGleamId,
      relationType: r.relationType as RelationType,
      strength: r.strength,
      origin: r.origin as RelationOrigin,
      createdAt: r.createdAt,
    }))
  }

  async getAllEmbeddings(excludeGleamId: string): Promise<
    Array<{
      gleamId: string
      embedding: Buffer
      dimensions: number | null
      embeddingModel: string | null
    }>
  > {
    const rows = this.db
      .select({
        gleamId: gleamAi.gleamId,
        embedding: gleamAi.embedding,
        dimensions: gleamAi.embeddingDimensions,
        embeddingModel: gleamAi.embeddingModel,
      })
      .from(gleamAi)
      .where(and(ne(gleamAi.gleamId, excludeGleamId), isNotNull(gleamAi.embedding)))
      .all()
    return rows.filter((r) => r.embedding !== null) as Array<{
      gleamId: string
      embedding: Buffer
      dimensions: number | null
      embeddingModel: string | null
    }>
  }

  // ── Intelligence: Provider configuration ─────────────

  async getIntelligenceConfig(): Promise<IntelligenceConfig | null> {
    const row = this.db.select().from(intelligenceConfig).limit(1).get()
    if (!row) return null
    return {
      provider: row.provider,
      model: row.model,
      embeddingModel: row.embeddingModel,
      endpoint: row.endpoint,
      encryptedApiKey: row.encryptedApiKey,
      apiKeyIv: row.apiKeyIv,
      updatedAt: row.updatedAt,
    }
  }

  async saveIntelligenceConfig(config: IntelligenceConfig): Promise<void> {
    const now = new Date().toISOString()
    // Single-row table: delete existing, then insert.
    const tx = this.sqlite.transaction(() => {
      this.db.delete(intelligenceConfig).run()
      this.db
        .insert(intelligenceConfig)
        .values({
          provider: config.provider,
          model: config.model,
          embeddingModel: config.embeddingModel,
          endpoint: config.endpoint,
          encryptedApiKey: config.encryptedApiKey,
          apiKeyIv: config.apiKeyIv,
          updatedAt: now,
        })
        .run()
    })
    tx()
  }

  async removeIntelligenceConfig(): Promise<void> {
    this.db.delete(intelligenceConfig).run()
  }

  async resetAllEmbeddings(): Promise<void> {
    const now = new Date().toISOString()
    // Flip embedding + relation status to pending for every Gleam. The
    // Scheduler discovers pending artifacts in batches and regenerates them.
    // Relation depends on embedding, so both reset together; user-created
    // relations survive the Relation stage's wholesale AI-relation replace.
    this.db
      .update(gleamAi)
      .set({
        embeddingStatus: 'pending',
        relationStatus: 'pending',
        updatedAt: now,
      })
      .run()
  }

  async getIntelligenceConfigView(): Promise<IntelligenceConfigView | null> {
    const row = this.db.select().from(intelligenceConfig).limit(1).get()
    if (!row) return null
    return {
      provider: row.provider,
      model: row.model,
      embeddingModel: row.embeddingModel,
      endpoint: row.endpoint,
      hasApiKey: row.encryptedApiKey.length > 0,
    }
  }

  // ── Intelligence: Prompt history ─────────────────────

  async savePromptSnapshot(
    capability: string,
    version: string,
    content: string,
    checksum: string,
  ): Promise<void> {
    const now = new Date().toISOString()
    // Upsert by (capability, version) primary key.
    this.db
      .insert(promptHistory)
      .values({
        capability,
        version,
        content,
        checksum,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run()
  }

  async getPromptSnapshot(capability: string, version: string): Promise<PromptSnapshot | null> {
    const row = this.db
      .select()
      .from(promptHistory)
      .where(and(eq(promptHistory.capability, capability), eq(promptHistory.version, version)))
      .get()
    if (!row) return null
    return {
      capability: row.capability,
      version: row.version,
      content: row.content,
      checksum: row.checksum,
      createdAt: row.createdAt,
    }
  }

  // ── Helpers ──────────────────────────────────────────

  private joinGleam(row: typeof gleams.$inferSelect): Gleam {
    const source = JSON.parse(row.source) as Source
    const derived = this.db
      .select()
      .from(gleamDerived)
      .where(eq(gleamDerived.gleamId, row.id))
      .get()

    // Visible tags = unique(userTags + aiTags) − removedTags.
    const userTags = derived ? (JSON.parse(derived.tags) as string[]) : []
    const removedTags = derived ? (JSON.parse(derived.removedTags) as string[]) : []
    const aiRow = this.db
      .select({ tags: gleamAi.tags })
      .from(gleamAi)
      .where(eq(gleamAi.gleamId, row.id))
      .get()
    const aiTags = aiRow?.tags ? (JSON.parse(aiRow.tags) as string[]) : []
    const visible = Array.from(new Set([...userTags, ...aiTags])).filter(
      (t) => !removedTags.includes(t),
    )

    return {
      id: row.id,
      thought: row.thought,
      source,
      createdAt: row.createdAt,
      tags: visible,
      revisitCount: derived?.revisitCount ?? 0,
      lastRevisitedAt: derived?.lastRevisitedAt ?? '',
    }
  }

  private upsertDerived(gleamId: string, derived: GleamDerived): void {
    const current = this.db
      .select()
      .from(gleamDerived)
      .where(eq(gleamDerived.gleamId, gleamId))
      .get()
    const removedTags = current ? (JSON.parse(current.removedTags) as string[]) : []

    this.db
      .insert(gleamDerived)
      .values({
        gleamId,
        tags: JSON.stringify(derived.tags),
        removedTags: JSON.stringify(removedTags),
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

  private mapGleamAIRow(row: typeof gleamAi.$inferSelect): GleamAI {
    return {
      gleamId: row.gleamId,
      provider: row.provider,
      model: row.model,
      summary: row.summary,
      tags: row.tags ? (JSON.parse(row.tags) as string[]) : null,
      embedding: (row.embedding as Buffer | null) ?? null,
      embeddingModel: row.embeddingModel,
      embeddingDimensions: row.embeddingDimensions,
      summaryVersion: row.summaryVersion,
      tagVersion: row.tagVersion,
      relationVersion: row.relationVersion,
      summaryStatus: row.summaryStatus as ObservationStatus,
      tagStatus: row.tagStatus as ObservationStatus,
      embeddingStatus: row.embeddingStatus as ObservationStatus,
      relationStatus: row.relationStatus as ObservationStatus,
      summaryRetryCount: row.summaryRetryCount,
      tagRetryCount: row.tagRetryCount,
      embeddingRetryCount: row.embeddingRetryCount,
      relationRetryCount: row.relationRetryCount,
      summaryLastAttemptAt: row.summaryLastAttemptAt,
      tagLastAttemptAt: row.tagLastAttemptAt,
      embeddingLastAttemptAt: row.embeddingLastAttemptAt,
      relationLastAttemptAt: row.relationLastAttemptAt,
      updatedAt: row.updatedAt,
    }
  }
}

// ── Embedding math helpers ─────────────────────────────

function bufferToFloat32(buf: Buffer): Float32Array {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  return new Float32Array(ab)
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
