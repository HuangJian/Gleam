import { IRepository } from '../domain/repository'

export interface TagCount {
  tag: string
  count: number
}

/**
 * Provides read access to the global tag vocabulary and its usage counts.
 * Tags are derived mutable fields, so this service only reads them.
 */
export class TagService {
  private repository: IRepository

  constructor(repository: IRepository) {
    this.repository = repository
  }

  /**
   * Returns all distinct tags across every Gleam, each with the number of
   * Gleams it is applied to, sorted by count descending then name ascending.
   */
  public async getAllTagCounts(): Promise<TagCount[]> {
    const gleams = await this.repository.getAll()
    const counts = new Map<string, number>()
    for (const gleam of gleams) {
      for (const tag of gleam.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  }
}
