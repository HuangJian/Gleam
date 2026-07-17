import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'
import { gleams, gleamDerived } from './schema'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

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

  const db = drizzle(sqlite, { schema: { gleams, gleamDerived } })

  runMigrations(db)
  setupFts(sqlite)

  return { db, sqlite }
}

function runMigrations(db: DB): void {
  try {
    migrate(db, { migrationsFolder: './drizzle' })
  } catch {
    createTablesManually(db)
  }
}

function createTablesManually(db: DB): void {
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
    revisit_count INTEGER NOT NULL DEFAULT 0,
    last_revisited_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (gleam_id) REFERENCES gleams(id) ON DELETE CASCADE
  )`)

  db.run(sql`CREATE INDEX IF NOT EXISTS idx_gleams_created_at ON gleams(created_at DESC)`)
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
