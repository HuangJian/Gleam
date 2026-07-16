import { Gleam } from './gleam'

export interface IRepository {
  /**
   * Saves a new Gleam to the repository.
   * Core fields are immutable; saving an existing ID should throw or fail.
   */
  save(gleam: Gleam): Promise<void>

  /**
   * Retrieves a Gleam by its UUID.
   */
  getById(id: string): Promise<Gleam | null>

  /**
   * Retrieves all Gleams, typically ordered chronologically.
   */
  getAll(): Promise<Gleam[]>

  /**
   * Deletes a Gleam by its ID.
   */
  delete(id: string): Promise<void>

  /**
   * Updates only the mutable derived fields of a Gleam.
   * Modifying thought, source, or created_at is strictly prohibited at this layer.
   */
  updateDerivedFields(
    id: string,
    updates: Partial<Pick<Gleam, 'tags' | 'revisit_count' | 'last_revisited_at'>>,
  ): Promise<void>

  /**
   * Renames a tag across every Gleam that uses it. If the target name already
   * exists on a Gleam, the two are merged (deduplicated). Operates only on the
   * derived `tags` field.
   */
  renameTag(oldTag: string, newTag: string): Promise<void>
}
