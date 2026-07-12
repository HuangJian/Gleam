import { createGleam, Source, SourceType } from '../domain/gleam'
import { IRepository } from '../domain/repository'
import { generateUUIDv7 } from '../utils/uuid'

export class CaptureService {
  private repository: IRepository

  constructor(repository: IRepository) {
    this.repository = repository
  }

  /**
   * Captures a new cognitive moment.
   * If on a browser page, it captures the page title and URL as source metadata.
   */
  public async capture(
    thought: string,
    excerpt?: string,
    customSource?: Partial<Source>,
  ): Promise<string> {
    const id = generateUUIDv7()

    // Auto-capture current page context if applicable
    const sourceUrl =
      customSource?.url || (typeof window !== 'undefined' ? window.location.href : undefined)
    const sourceTitle =
      customSource?.title || (typeof document !== 'undefined' ? document.title : undefined)
    const sourceType: SourceType = customSource?.type || (sourceUrl ? 'url' : 'experience')

    const source: Source = {
      type: sourceType,
      url: sourceUrl,
      title: sourceTitle,
      excerpt: excerpt || customSource?.excerpt,
    }

    const newGleam = createGleam(id, thought, source)
    await this.repository.save(newGleam)

    return id
  }
}
