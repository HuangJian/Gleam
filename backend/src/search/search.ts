import type { IRepository, SearchResult } from '../repository/repository'

/**
 * Search service — the secondary retrieval model.
 *
 * Delegates to the repository's search method which uses FTS5.
 * Ranking combines database relevance with field weights.
 */
export class SearchService {
  constructor(private readonly repository: IRepository) {}

  async search(query: string, limit: number = 20, offset: number = 0): Promise<SearchResult> {
    return this.repository.search(query, limit, offset)
  }
}
