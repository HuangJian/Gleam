import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
 * Upsert allowed. This is the only table that accepts mutations.
 * One-to-one relationship with `gleams`.
 */
export const gleamDerived = sqliteTable('gleam_derived', {
  gleamId: text('gleam_id').primaryKey(),
  tags: text('tags').notNull().default('[]'),
  revisitCount: integer('revisit_count').notNull().default(0),
  lastRevisitedAt: text('last_revisited_at').notNull().default(''),
})

export type GleamRow = typeof gleams.$inferSelect
export type GleamDerivedRow = typeof gleamDerived.$inferSelect
