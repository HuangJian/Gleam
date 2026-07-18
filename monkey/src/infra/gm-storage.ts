import { Gleam } from '../domain/gleam'
import { IRepository, ILocalCache } from '../domain/repository'

declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue<T>(key: string, value: T): void
declare function GM_deleteValue(key: string): void
declare function GM_listValues(): string[]

const FAB_POSITIONS_KEY = 'gleam_fab_positions'

/** Stored as margins from the right/bottom edges so the FAB stays put across
 *  viewport sizes. */
export interface FabMargins {
  right: number
  bottom: number
}

type FabMarginMap = Record<string, FabMargins>

/** Reads the persisted FAB margins for a domain, or undefined if none saved. */
export function loadFabPosition(domain: string): FabMargins | undefined {
  try {
    const map = GM_getValue<FabMarginMap>(FAB_POSITIONS_KEY, {})
    const m = map[domain]
    if (m && typeof m.right === 'number' && typeof m.bottom === 'number') return m
    return undefined
  } catch {
    return undefined
  }
}

/** Persists the FAB margins for a domain so they survive page reloads. */
export function saveFabPosition(domain: string, margins: FabMargins): void {
  try {
    const map = GM_getValue<FabMarginMap>(FAB_POSITIONS_KEY, {})
    map[domain] = margins
    GM_setValue(FAB_POSITIONS_KEY, map)
  } catch (e) {
    console.warn('[gleam] Failed to persist FAB position:', e)
  }
}

/** Removes a domain's stored FAB position (e.g. when it returns to default). */
export function clearFabPosition(domain: string): void {
  try {
    const map = GM_getValue<FabMarginMap>(FAB_POSITIONS_KEY, {})
    if (domain in map) {
      delete map[domain]
      GM_setValue(FAB_POSITIONS_KEY, map)
    }
  } catch (e) {
    console.warn('[gleam] Failed to clear FAB position:', e)
  }
}

// ── Per-gleam key storage ──────────────────────────────
//
// Each gleam is stored under its own GM key: `gleam:<id>`.
//
// This eliminates the read-modify-write race condition that existed when all
// gleams were stored in a single JSON object under one key. With per-gleam
// keys, save() and clearSynced() are single-key atomic operations — multiple
// tabs can capture and sync concurrently without data loss.
//
// getAll() uses GM_listValues() to enumerate keys, which is a read-only
// snapshot. Even if a new gleam is saved mid-enumeration, it simply won't
// appear in that particular snapshot — it will be picked up on the next call.
// No data is lost.

const GLEAM_KEY_PREFIX = 'gleam:'

function gleamKey(id: string): string {
  return GLEAM_KEY_PREFIX + id
}

export class GMStorageAdapter implements IRepository, ILocalCache {
  // ── IRepository ──────────────────────────────────────

  public async save(gleam: Gleam): Promise<void> {
    const key = gleamKey(gleam.id)
    // Check existence first to enforce immutability of core fields.
    // This is a read-before-write, but the race window is negligible: two tabs
    // saving the same UUID v7 simultaneously is astronomically unlikely
    // (UUID v7 embeds millisecond timestamp + 74 bits of randomness).
    if (GM_getValue<Gleam | null>(key, null)) {
      throw new Error(`Gleam with ID ${gleam.id} already exists. Core fields are immutable.`)
    }
    // Atomic single-key write — no read-modify-write on a shared object.
    GM_setValue(key, { ...gleam })
  }

  public async getById(id: string): Promise<Gleam | null> {
    return GM_getValue<Gleam | null>(gleamKey(id), null)
  }

  public async getAll(): Promise<Gleam[]> {
    const keys = GM_listValues().filter((k) => k.startsWith(GLEAM_KEY_PREFIX))
    const gleams: Gleam[] = []
    for (const k of keys) {
      const g = GM_getValue<Gleam | null>(k, null)
      if (g) gleams.push(g)
    }
    // Sort chronologically (newest first)
    return gleams.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  public async updateDerivedFields(
    id: string,
    updates: Partial<Pick<Gleam, 'tags' | 'revisitCount' | 'lastRevisitedAt'>>,
  ): Promise<void> {
    const key = gleamKey(id)
    const gleam = GM_getValue<Gleam | null>(key, null)
    // In the thin-cache model, a gleam's local key is deleted once it has been
    // synced to the server (see ILocalCache.clearSynced). Derived-field updates
    // are authoritative on the server, so a missing local key is expected and
    // must NOT throw — otherwise tag/revisit edits on already-synced gleams
    // fail silently (the input clears but the change is lost). Skip the local
    // write; the server mutation still runs via SyncService.
    if (!gleam) {
      return
    }

    // Apply updates strictly to derived mutable fields.
    // This is a read-modify-write on a SINGLE key, so the race window is
    // extremely narrow and only affects one gleam (not the entire dataset).
    // Two tabs updating the same gleam's tags simultaneously could lose one
    // update, but this is a rare edge case with minimal impact.
    if (updates.tags !== undefined) {
      gleam.tags = updates.tags
    }
    if (updates.revisitCount !== undefined) {
      gleam.revisitCount = updates.revisitCount
    }
    if (updates.lastRevisitedAt !== undefined) {
      gleam.lastRevisitedAt = updates.lastRevisitedAt
    }

    GM_setValue(key, gleam)
  }

  public async renameTag(oldTag: string, newTag: string): Promise<void> {
    const normalizedOld = oldTag.trim()
    const normalizedNew = newTag.trim()
    if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) {
      return
    }

    // Enumerate all gleam keys and update each independently.
    // Each gleam is written atomically, so a concurrent save() on a different
    // gleam cannot be lost. A concurrent save() on a gleam that this loop
    // hasn't reached yet will simply not be renamed (acceptable — the user
    // can re-run renameTag).
    const keys = GM_listValues().filter((k) => k.startsWith(GLEAM_KEY_PREFIX))
    for (const k of keys) {
      const gleam = GM_getValue<Gleam | null>(k, null)
      if (!gleam || !gleam.tags.includes(normalizedOld)) continue
      const next = Array.from(
        new Set(gleam.tags.filter((t) => t !== normalizedOld).concat(normalizedNew)),
      )
      gleam.tags = next
      GM_setValue(k, gleam) // atomic per-gleam write
    }
  }

  // ── ILocalCache ──────────────────────────────────────

  public async clearSynced(ids: string[]): Promise<void> {
    // Atomic per-gleam deletion — no read-modify-write on a shared object.
    // Even if another tab saves a new gleam between deletions, that new
    // gleam's key is untouched and will not be lost.
    for (const id of ids) {
      GM_deleteValue(gleamKey(id))
    }
  }
}
