import { Gleam } from '../domain/gleam'
import { IRepository } from '../domain/repository'

declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue<T>(key: string, value: T): void

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
}
