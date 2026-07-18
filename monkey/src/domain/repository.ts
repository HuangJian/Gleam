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
   * Updates only the mutable derived fields of a Gleam.
   * Modifying thought, source, or createdAt is strictly prohibited at this layer.
   */
  updateDerivedFields(
    id: string,
    updates: Partial<Pick<Gleam, 'tags' | 'revisitCount' | 'lastRevisitedAt'>>,
  ): Promise<void>

  /**
   * Renames a tag across every Gleam that uses it. If the target name already
   * exists on a Gleam, the two are merged (deduplicated). Operates only on the
   * derived `tags` field.
   */
  renameTag(oldTag: string, newTag: string): Promise<void>
}

/**
 * Local cache management for the "thin cache" sync model.
 *
 * The local GM_storage holds only gleams that haven't been successfully
 * uploaded to the server yet. Once a gleam is confirmed on the server,
 * `clearSynced` removes it from the local cache.
 *
 * This is NOT a domain delete — the gleam continues to exist in the server
 * archive. It only removes the local cached copy that was pending upload.
 */
export interface ILocalCache {
  /**
   * Removes gleams that have been successfully uploaded to the server.
   * @param ids - UUIDs of gleams confirmed on the server.
   */
  clearSynced(ids: string[]): Promise<void>
}
