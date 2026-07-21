import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'
import {
  gleams,
  gleamDerived,
  gleamAi,
  gleamRelations,
  intelligenceConfig,
  promptHistory,
  repositoryAi,
} from './schema'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { logger } from '../util/logger'

export type DB = BunSQLiteDatabase<typeof schema>
export type SqliteDB = Database

/**
 * Initializes the SQLite database, creating the data directory if needed,
 * running migrations, and setting up the FTS5 index.
 */
export function initDatabase(dbPath: string): { db: DB; sqlite: Database } {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const sqlite = new Database(dbPath)
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')

  const db = drizzle(sqlite, {
    schema: {
      gleams,
      gleamDerived,
      gleamAi,
      gleamRelations,
      intelligenceConfig,
      promptHistory,
      repositoryAi,
    },
  })

  runMigrations(db, sqlite)
  setupFts(sqlite)

  return { db, sqlite }
}

function runMigrations(db: DB, sqlite: Database): void {
  try {
    migrate(db, { migrationsFolder: './drizzle' })
  } catch (e) {
    logger.warn('Drizzle migrations folder unavailable, creating tables manually', {
      reason: e instanceof Error ? e.message : String(e),
    })
    createTablesManually(db, sqlite)
  }
}

/**
 * Fallback schema creation when the migrations folder is not present
 * (e.g. fresh test database, Docker image without migrations folder).
 *
 * Keeps the existing `gleams` / `gleam_derived` tables (with the new
 * `removed_tags` column) and adds all Intelligence tables.
 */
function createTablesManually(db: DB, sqlite: Database): void {
  db.run(sql`CREATE TABLE IF NOT EXISTS gleams (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    thought TEXT NOT NULL,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    received_at TEXT NOT NULL
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS gleam_derived (
    gleam_id TEXT PRIMARY KEY,
    tags TEXT NOT NULL DEFAULT '[]',
    removed_tags TEXT NOT NULL DEFAULT '[]',
    revisit_count INTEGER NOT NULL DEFAULT 0,
    last_revisited_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (gleam_id) REFERENCES gleams(id) ON DELETE CASCADE
  )`)
  // Ensure removed_tags exists on pre-existing databases.
  ensureColumn(sqlite, 'gleam_derived', 'removed_tags', "TEXT NOT NULL DEFAULT '[]'")

  db.run(sql`CREATE TABLE IF NOT EXISTS gleam_ai (
    gleam_id TEXT PRIMARY KEY,
    provider TEXT,
    model TEXT,
    summary TEXT,
    tags TEXT,
    embedding BLOB,
    embedding_model TEXT,
    embedding_dimensions INTEGER,
    summary_version TEXT,
    tag_version TEXT,
    relation_version TEXT,
    summary_status TEXT NOT NULL DEFAULT 'pending',
    tag_status TEXT NOT NULL DEFAULT 'pending',
    embedding_status TEXT NOT NULL DEFAULT 'pending',
    relation_status TEXT NOT NULL DEFAULT 'pending',
    summary_retry_count INTEGER NOT NULL DEFAULT 0,
    tag_retry_count INTEGER NOT NULL DEFAULT 0,
    embedding_retry_count INTEGER NOT NULL DEFAULT 0,
    relation_retry_count INTEGER NOT NULL DEFAULT 0,
    summary_last_attempt_at TEXT,
    tag_last_attempt_at TEXT,
    embedding_last_attempt_at TEXT,
    relation_last_attempt_at TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (gleam_id) REFERENCES gleams(id) ON DELETE CASCADE
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS gleam_relations (
    id TEXT PRIMARY KEY,
    source_gleam_id TEXT NOT NULL,
    target_gleam_id TEXT NOT NULL,
    relation_type TEXT NOT NULL DEFAULT 'semantic_proximity',
    strength REAL,
    origin TEXT NOT NULL DEFAULT 'ai',
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_gleam_id) REFERENCES gleams(id) ON DELETE CASCADE,
    FOREIGN KEY (target_gleam_id) REFERENCES gleams(id) ON DELETE CASCADE
  )`)
  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_gleam_relations_unique
    ON gleam_relations(source_gleam_id, target_gleam_id, relation_type)`)

  db.run(sql`CREATE TABLE IF NOT EXISTS intelligence_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    encrypted_api_key TEXT NOT NULL,
    api_key_iv TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`)
  // Ensure embedding_model and endpoint exist on pre-existing databases.
  ensureColumn(sqlite, 'intelligence_config', 'embedding_model', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(sqlite, 'intelligence_config', 'endpoint', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(sqlite, 'intelligence_config', 'reasoning_suppression', 'INTEGER NOT NULL DEFAULT 0')

  db.run(sql`CREATE TABLE IF NOT EXISTS prompt_history (
    capability TEXT NOT NULL,
    version TEXT NOT NULL,
    content TEXT NOT NULL,
    checksum TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (capability, version)
  )`)

  db.run(sql`CREATE TABLE IF NOT EXISTS repository_ai (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  )`)

  db.run(sql`CREATE INDEX IF NOT EXISTS idx_gleams_created_at ON gleams(created_at DESC)`)
}

function ensureColumn(sqlite: Database, table: string, column: string, definition: string): void {
  const row = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!row.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function setupFts(sqlite: Database): void {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS gleams_fts USING fts5(
      gleam_id UNINDEXED,
      thought,
      source_title,
      source_excerpt,
      source_url,
      tags,
      tokenize = 'unicode61'
    );
  `)
}
