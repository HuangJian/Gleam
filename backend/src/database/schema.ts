import { integer, sqliteTable, text, real, blob } from 'drizzle-orm/sqlite-core'

/**
 * `gleams` — core, immutable table.
 * Insert-only. No UPDATE, no DELETE.
 * `content` stores the original JSON as received (write-once archive).
 * `source` is a denormalized copy of content's `source` field for efficient querying.
 */
export const gleams = sqliteTable('gleams', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  thought: text('thought').notNull(),
  source: text('source').notNull(),
  content: text('content').notNull(),
  receivedAt: text('received_at').notNull(),
})

/**
 * `gleam_derived` — derived, mutable table.
 * Upsert allowed. This is the only table that accepts mutations
 * against user-owned derived data.
 * One-to-one relationship with `gleams`.
 *
 * `removed_tags` is managed exclusively by the backend through GraphQL
 * mutations (removeTag). It records AI-suggested tags the user has
 * explicitly rejected, so future AI regeneration remains deterministic
 * even if the same tag is suggested again.
 */
export const gleamDerived = sqliteTable('gleam_derived', {
  gleamId: text('gleam_id').primaryKey(),
  tags: text('tags').notNull().default('[]'),
  removedTags: text('removed_tags').notNull().default('[]'),
  revisitCount: integer('revisit_count').notNull().default(0),
  lastRevisitedAt: text('last_revisited_at').notNull().default(''),
})

/**
 * `gleam_ai` — per-Gleam semantic observation record.
 *
 * Created by the Scheduler when it discovers a Gleam that has not yet
 * been observed. Each `*_status` field tracks one semantic artifact
 * independently. Repository data (gleams) never enters these states.
 *
 * Deleting every row here must never affect Repository integrity.
 */
export const gleamAi = sqliteTable('gleam_ai', {
  gleamId: text('gleam_id').primaryKey(),
  provider: text('provider'),
  model: text('model'),

  // Semantic artifacts
  summary: text('summary'),
  tags: text('tags'),
  embedding: blob('embedding'),

  // Embedding-specific metadata
  embeddingModel: text('embedding_model'),
  embeddingDimensions: integer('embedding_dimensions'),

  // Per-artifact prompt version (provenance)
  summaryVersion: text('summary_version'),
  tagVersion: text('tag_version'),
  relationVersion: text('relation_version'),

  // Per-artifact processing state
  summaryStatus: text('summary_status').notNull().default('pending'),
  tagStatus: text('tag_status').notNull().default('pending'),
  embeddingStatus: text('embedding_status').notNull().default('pending'),
  relationStatus: text('relation_status').notNull().default('pending'),

  // Retry tracking
  summaryRetryCount: integer('summary_retry_count').notNull().default(0),
  tagRetryCount: integer('tag_retry_count').notNull().default(0),
  embeddingRetryCount: integer('embedding_retry_count').notNull().default(0),
  relationRetryCount: integer('relation_retry_count').notNull().default(0),

  // Last attempt timestamps (ISO 8601) for backoff scheduling
  summaryLastAttemptAt: text('summary_last_attempt_at'),
  tagLastAttemptAt: text('tag_last_attempt_at'),
  embeddingLastAttemptAt: text('embedding_last_attempt_at'),
  relationLastAttemptAt: text('relation_last_attempt_at'),

  updatedAt: text('updated_at').notNull(),
})

/**
 * `gleam_relations` — many-to-many semantic connections between Gleams.
 *
 * AI-generated relations are replaced wholesale whenever the Relation
 * Stage re-runs for a source Gleam. User-created relations are never
 * automatically modified or deleted.
 *
 * UNIQUE(source_gleam_id, target_gleam_id, relation_type) prevents
 * duplicate edges of the same type.
 */
export const gleamRelations = sqliteTable('gleam_relations', {
  id: text('id').primaryKey(),
  sourceGleamId: text('source_gleam_id').notNull(),
  targetGleamId: text('target_gleam_id').notNull(),
  relationType: text('relation_type').notNull().default('semantic_proximity'),
  strength: real('strength'),
  origin: text('origin').notNull().default('ai'),
  createdAt: text('created_at').notNull(),
})

/**
 * `intelligence_config` — single-row provider configuration.
 *
 * Stores encrypted API key + IV. API keys are write-only through GraphQL;
 * the key itself is never returned. Only a boolean indicating presence
 * is exposed.
 */
export const intelligenceConfig = sqliteTable('intelligence_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  encryptedApiKey: text('encrypted_api_key').notNull(),
  apiKeyIv: text('api_key_iv').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * `prompt_history` — archived snapshots of Prompt files.
 *
 * Whenever a Prompt version is used for the first time, its complete
 * content is archived here. The `checksum` (sha256) enables
 * deduplication, integrity verification, and tamper detection.
 *
 * Snapshots are never consulted during normal execution — their purpose
 * is historical explainability of previously generated artifacts.
 */
export const promptHistory = sqliteTable('prompt_history', {
  capability: text('capability').notNull(),
  version: text('version').notNull(),
  content: text('content').notNull(),
  checksum: text('checksum').notNull(),
  createdAt: text('created_at').notNull(),
})

/**
 * `repository_ai` — placeholder for future repository-level semantic
 * observations (clustering, topic evolution, Reflection, timeline
 * emergence). Version 1 introduces only the table; no schema is defined.
 *
 * Future semantic capabilities should persist repository-wide observations
 * here independently from per-Gleam artifacts in `gleam_ai`.
 */
export const repositoryAi = sqliteTable('repository_ai', {
  id: text('id').primaryKey(),
  // Intentionally minimal — schema will be defined when Reflection lands.
  createdAt: text('created_at').notNull(),
})

// ── Row types ──────────────────────────────────────────

export type GleamRow = typeof gleams.$inferSelect
export type GleamDerivedRow = typeof gleamDerived.$inferSelect
export type GleamAiRow = typeof gleamAi.$inferSelect
export type GleamRelationRow = typeof gleamRelations.$inferSelect
export type IntelligenceConfigRow = typeof intelligenceConfig.$inferSelect
export type PromptHistoryRow = typeof promptHistory.$inferSelect
