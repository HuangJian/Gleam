import type { IRepository, ILocalCache } from '../domain/repository'
import type {
  ServerClient,
  SearchHit,
  SearchResult,
  TimelineResult,
  TimelineOptions,
  DerivedUpdates,
} from '../infra/server-client'
import { runQuery } from '../../shared/query'

// ── Cross-tab sync deduplication ───────────────────────
//
// When multiple tabs are open, each tab's SyncService may trigger
// syncPending() concurrently. appendGleams is idempotent on the server
// (duplicate IDs are skipped), so concurrent uploads don't cause data
// duplication — but they waste bandwidth and server CPU.
//
// We use a GM_setValue timestamp as a lightweight "sync in progress"
// marker. This is NOT a strict mutex (GM_setValue isn't CAS-atomic across
// tabs), but it dramatically reduces the probability of concurrent uploads.
// Even if two tabs race past the check, the worst case is a redundant
// idempotent request — never data loss.

declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: unknown): void

const SYNC_LOCK_KEY = 'gleam_sync_lock'
const SYNC_LOCK_TTL_MS = 8000 // 8 seconds — enough for a typical appendGleams round-trip

// ── Types ──────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'disconnected' | 'syncing'

export interface SyncState {
  status: ConnectionStatus
  pendingCount: number
  lastSyncAt: string | null
  error: string | null
}

export interface SyncedTimelineResult extends TimelineResult {
  source: 'remote' | 'local'
}

export interface SyncedSearchResult extends SearchResult {
  source: 'remote' | 'local'
}

export interface SyncResult {
  uploaded: number
  skipped: number
  failed: number
}

// ── SyncService ────────────────────────────────────────

/**
 * Orchestrates local cache and remote server.
 *
 * Thin-cache model: local storage holds only gleams pending upload.
 * The server is the single source of truth for the complete archive.
 *
 * On any remote operation failure, the service gracefully degrades to
 * local-only mode — the user can always capture and review locally.
 */
export class SyncService {
  private state: SyncState = {
    status: 'disconnected',
    pendingCount: 0,
    lastSyncAt: null,
    error: null,
  }
  private listeners = new Set<(state: SyncState) => void>()

  constructor(
    private repository: IRepository & ILocalCache,
    private serverClient: ServerClient,
  ) {
    void this.refreshPendingCount()
  }

  // ── State management ─────────────────────────────────

  getState(): SyncState {
    return this.state
  }

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private setState(updates: Partial<SyncState>): void {
    this.state = { ...this.state, ...updates }
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  private async refreshPendingCount(): Promise<void> {
    const pending = await this.repository.getAll()
    this.setState({ pendingCount: pending.length })
  }

  // ── Connection ───────────────────────────────────────

  /** Tests the server connection and updates state. */
  async testConnection(): Promise<boolean> {
    this.setState({ status: 'syncing', error: null })
    const ok = await this.serverClient.ping()
    this.setState({
      status: ok ? 'connected' : 'disconnected',
      error: ok ? null : '无法连接到服务器',
    })
    return ok
  }

  // ── Upload pending gleams ────────────────────────────

  /** Uploads all pending gleams to the server and clears them from local cache.
   *
   *  Uses a cross-tab timestamp marker to reduce redundant concurrent uploads
   *  when multiple tabs are open. This is a best-effort optimization, not a
   *  strict lock — the server's appendGleams is idempotent, so even if two
   *  tabs race past the check, no data is duplicated or lost. */
  async syncPending(): Promise<SyncResult> {
    const pending = await this.repository.getAll()
    if (pending.length === 0) {
      return { uploaded: 0, skipped: 0, failed: 0 }
    }

    // Cross-tab dedup: if another tab started a sync recently, skip this one.
    // The pending gleams will be uploaded by the other tab and cleared from
    // the shared local cache.
    const lastSyncStart = GM_getValue<number>(SYNC_LOCK_KEY, 0)
    if (Date.now() - lastSyncStart < SYNC_LOCK_TTL_MS) {
      return { uploaded: 0, skipped: 0, failed: 0 }
    }
    // Mark sync in progress (best-effort — not a strict CAS).
    GM_setValue(SYNC_LOCK_KEY, Date.now())

    this.setState({ status: 'syncing', error: null })
    try {
      const result = await this.serverClient.appendGleams(pending)

      // Collect IDs that were confirmed on the server (accepted or skipped = idempotent).
      const errorIds = new Set(result.errors.map((e) => e.id))
      const confirmedIds = pending.filter((g) => !errorIds.has(g.id)).map((g) => g.id)

      // Clear confirmed gleams from the local cache.
      if (confirmedIds.length > 0) {
        await this.repository.clearSynced(confirmedIds)
      }

      const remaining = pending.length - confirmedIds.length
      this.setState({
        status: 'connected',
        lastSyncAt: new Date().toISOString(),
        pendingCount: remaining,
        error: remaining > 0 ? `${remaining} 个 gleam 上传失败` : null,
      })

      return {
        uploaded: result.accepted,
        skipped: result.skipped,
        failed: result.rejected,
      }
    } catch (e) {
      this.setState({
        status: 'disconnected',
        error: e instanceof Error ? e.message : '同步失败',
      })
      return { uploaded: 0, skipped: 0, failed: pending.length }
    }
  }

  // ── Remote operations (with local fallback) ──────────

  /** Fetches the timeline. Falls back to local cache on server failure. */
  async getTimeline(options: TimelineOptions = {}): Promise<SyncedTimelineResult> {
    try {
      const result = await this.serverClient.getTimeline(options)
      this.setState({ status: 'connected', error: null })
      return { ...result, source: 'remote' }
    } catch {
      // Fallback: local cache only (pending gleams)
      const items = await this.repository.getAll()
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      this.setState({ status: 'disconnected', error: '离线模式：显示本地缓存' })
      return {
        items,
        total: items.length,
        hasMore: false,
        source: 'local',
      }
    }
  }

  /** Searches gleams. Falls back to local search on server failure. */
  async search(query: string, limit = 50, offset = 0): Promise<SyncedSearchResult> {
    try {
      const result = await this.serverClient.search(query, limit, offset)
      this.setState({ status: 'connected', error: null })
      return { ...result, source: 'remote' }
    } catch {
      // Fallback: search local cache using the shared query engine
      const allGleams = await this.repository.getAll()
      const matched = runQuery(query, allGleams)
      const items: SearchHit[] = matched.slice(offset, offset + limit).map((gleam) => ({
        gleam,
        score: 1,
        highlight: null, // local search doesn't produce highlights
      }))
      this.setState({ status: 'disconnected', error: '离线搜索：仅搜索本地缓存' })
      return { items, total: matched.length, source: 'local' }
    }
  }

  // ── Derived field operations (local-first, async sync) ──

  /** Updates derived fields locally, then syncs to server. */
  async updateDerivedFields(id: string, updates: DerivedUpdates): Promise<void> {
    // Local-first: update immediately for responsiveness
    await this.repository.updateDerivedFields(id, updates)

    // Best-effort server sync — failures are logged but don't block the user.
    try {
      await this.serverClient.updateDerivedFields(id, updates)
    } catch {
      console.debug('[gleam] Server updateDerivedFields failed, local only:', id)
    }
  }

  /** Renames a tag locally, then syncs to server. */
  async renameTag(oldTag: string, newTag: string): Promise<void> {
    // Local-first
    await this.repository.renameTag(oldTag, newTag)

    // Best-effort server sync
    try {
      await this.serverClient.renameTag(oldTag, newTag)
    } catch {
      console.debug('[gleam] Server renameTag failed, local only')
    }
  }

  /** Called after a new gleam is captured to trigger async upload. */
  async onGleamCaptured(): Promise<void> {
    await this.refreshPendingCount()
    // Attempt immediate sync — if the server is unreachable, the gleam
    // stays in the local cache and will be retried later.
    void this.syncPending()
  }

  /** Re-counts pending gleams (called after capture or manual refresh). */
  async refreshState(): Promise<void> {
    await this.refreshPendingCount()
  }
}
