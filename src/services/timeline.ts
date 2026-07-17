import { Gleam } from '../domain/gleam'
import { IRepository } from '../domain/repository'
import { QueryService } from './query'

export interface TimelineGroup {
  dateLabel: string // e.g., "2026-07-12"
  gleams: Gleam[]
}

export class TimelineService {
  private repository: IRepository
  private queryService: QueryService

  constructor(repository: IRepository) {
    this.repository = repository
    this.queryService = new QueryService(repository)
  }

  /**
   * Retrieves and formats Gleams into chronological daily groups.
   */
  public async getTimeline(query?: string): Promise<TimelineGroup[]> {
    const gleams =
      query && query.trim() !== ''
        ? await this.queryService.query(query)
        : await this.repository.getAll()

    // Group gleams by local date string
    const groupsMap: Record<string, Gleam[]> = {}

    for (const gleam of gleams) {
      const date = new Date(gleam.createdAt)
      const dateLabel = this.formatDateLabel(date)
      if (!groupsMap[dateLabel]) {
        groupsMap[dateLabel] = []
      }
      groupsMap[dateLabel].push(gleam)
    }

    return Object.entries(groupsMap).map(([dateLabel, items]) => ({
      dateLabel,
      // Ensure they are sorted by date descending inside each group
      gleams: items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }))
  }

  /**
   * Increments the revisit counter for a Gleam when it's viewed/focused.
   */
  public async recordRevisit(id: string): Promise<void> {
    const gleam = await this.repository.getById(id)
    if (!gleam) return

    const currentCount = gleam.revisitCount
    await this.repository.updateDerivedFields(id, {
      revisitCount: currentCount + 1,
      lastRevisitedAt: new Date().toISOString(),
    })
  }

  private formatDateLabel(date: Date): string {
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    if (this.isSameDay(date, today)) {
      return 'Today'
    } else if (this.isSameDay(date, yesterday)) {
      return 'Yesterday'
    }

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  private isSameDay(d1: Date, d2: Date): boolean {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    )
  }
}
