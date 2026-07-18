import { IRepository } from '../domain/repository'
import { runQuery } from '../../shared/query'

// Re-export the shared query language (single source of truth in shared/query.ts).
// The shared module is imported by both the client and the backend so that
// query semantics stay identical across ends.
export {
  parseQuery,
  evaluateQuery,
  runQuery,
  extractKeywords,
  QueryParseError,
  getSourceHost,
} from '../../shared/query'
export type { QueryNode } from '../../shared/query'

/**
 * Recall service: runs a query against the local repository.
 *
 * NOTE: This is the client-side convenience wrapper. The actual query language
 * implementation lives in `shared/query.ts` and is shared with the backend.
 */
export class QueryService {
  private repository: IRepository

  constructor(repository: IRepository) {
    this.repository = repository
  }

  public async query(input: string): Promise<import('../../shared/types').Gleam[]> {
    const gleams = await this.repository.getAll()
    return runQuery(input, gleams)
  }
}
