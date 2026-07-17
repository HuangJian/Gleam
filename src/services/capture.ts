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

    // Auto-capture current page context only when there's an excerpt (text selection)
    // or a custom source — not for pure thoughts without page context
    const hasExcerpt = !!(excerpt || customSource?.excerpt)
    const sourceUrl =
      customSource?.url || (hasExcerpt && typeof window !== 'undefined' ? window.location.href : '')
    const sourceTitle =
      customSource?.title || (hasExcerpt && typeof document !== 'undefined' ? document.title : '')
    const sourceType: SourceType = customSource?.type || (sourceUrl ? 'url' : 'thought')

    const source: Source = {
      type: sourceType,
      url: sourceUrl,
      title: sourceTitle,
      excerpt: excerpt || customSource?.excerpt || '',
      media: customSource?.media,
    }

    const newGleam = createGleam(id, thought, source)
    await this.repository.save(newGleam)

    return id
  }
}
