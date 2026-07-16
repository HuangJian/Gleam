import { Gleam } from '../domain/gleam'
import { IRepository } from '../domain/repository'

declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue<T>(key: string, value: T): void

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

export class GMStorageAdapter implements IRepository {
  private readonly STORAGE_KEY = 'gleam_records'

  private loadRecords(): Record<string, Gleam> {
    try {
      return GM_getValue<Record<string, Gleam>>(this.STORAGE_KEY, {})
    } catch (e) {
      console.error('Failed to load Gleam records from GM storage:', e)
      return {}
    }
  }

  private saveRecords(records: Record<string, Gleam>): void {
    try {
      GM_setValue(this.STORAGE_KEY, records)
    } catch (e) {
      console.error('Failed to save Gleam records to GM storage:', e)
      throw new Error('Storage write failed', { cause: e })
    }
  }

  public async save(gleam: Gleam): Promise<void> {
    const records = this.loadRecords()
    if (records[gleam.id]) {
      throw new Error(`Gleam with ID ${gleam.id} already exists. Core fields are immutable.`)
    }
    records[gleam.id] = { ...gleam }
    this.saveRecords(records)
  }

  public async getById(id: string): Promise<Gleam | null> {
    const records = this.loadRecords()
    return records[id] || null
  }

  public async getAll(): Promise<Gleam[]> {
    const records = this.loadRecords()
    // Sort chronologically (UUID v7 inherently sorts chronologically by time part,
    // but sorting by created_at ISO string or time extraction is safer and explicit)
    return Object.values(records).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }

  public async delete(id: string): Promise<void> {
    const records = this.loadRecords()
    if (records[id]) {
      delete records[id]
      this.saveRecords(records)
    }
  }

  public async search(query: string): Promise<Gleam[]> {
    const records = await this.getAll()
    if (!query.trim()) {
      return records
    }
    const cleanQuery = query.toLowerCase().trim()
    return records.filter((gleam) => {
      const matchThought = gleam.thought.toLowerCase().includes(cleanQuery)
      const matchTags = gleam.tags?.some((t) => t.toLowerCase().includes(cleanQuery)) || false
      const matchTitle = gleam.source.title?.toLowerCase().includes(cleanQuery) || false
      const matchExcerpt = gleam.source.excerpt?.toLowerCase().includes(cleanQuery) || false

      return matchThought || matchTags || matchTitle || matchExcerpt
    })
  }

  public async updateDerivedFields(
    id: string,
    updates: Partial<Pick<Gleam, 'tags' | 'revisit_count' | 'last_revisited_at'>>,
  ): Promise<void> {
    const records = this.loadRecords()
    const gleam = records[id]
    if (!gleam) {
      throw new Error(`Gleam with ID ${id} not found.`)
    }

    // Apply updates strictly to derived mutable fields
    if (updates.tags !== undefined) {
      gleam.tags = updates.tags
    }
    if (updates.revisit_count !== undefined) {
      gleam.revisit_count = updates.revisit_count
    }
    if (updates.last_revisited_at !== undefined) {
      gleam.last_revisited_at = updates.last_revisited_at
    }

    records[id] = gleam
    this.saveRecords(records)
  }

  public async renameTag(oldTag: string, newTag: string): Promise<void> {
    const normalizedOld = oldTag.trim()
    const normalizedNew = newTag.trim()
    if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) {
      return
    }

    const records = this.loadRecords()
    let changed = false
    for (const gleam of Object.values(records)) {
      const tags = gleam.tags ?? []
      if (!tags.includes(normalizedOld)) continue
      const next = tags.filter((t) => t !== normalizedOld).concat(normalizedNew)
      gleam.tags = Array.from(new Set(next))
      records[gleam.id] = gleam
      changed = true
    }
    if (changed) {
      this.saveRecords(records)
    }
  }
}
