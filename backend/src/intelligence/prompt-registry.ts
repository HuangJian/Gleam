import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { logger } from '../util/logger'
import type { IIntelligenceRepository } from '../repository/repository'

/**
 * Prompt Registry — maps logical capabilities to the latest available
 * prompt version.
 *
 * Prompt files are versioned product assets. They live under
 * `backend/prompts/<capability>/<version>.md`. The registry scans the
 * directory at startup, builds an in-memory mapping, and stages any
 * new (capability, version) pairs into `prompt_history` for archival.
 *
 * Pipeline stages never load prompt files directly — they resolve
 * prompts through this registry. This indirection allows prompt
 * evolution without changing processing logic.
 *
 *   summary   → v1   (content loaded once at startup)
 *   tags      → v1
 *   relation  → v1
 *
 * The "latest" version is determined by sorting version strings
 * naturally (v1 < v2 < v10). Only the latest is exposed to stages;
 * historical versions remain in `prompt_history` for explainability.
 */

export type PromptCapability = 'summary' | 'tags' | 'relation'

export interface ResolvedPrompt {
  capability: string
  version: string
  content: string
  checksum: string
}

export class PromptRegistry {
  private readonly promptsDir: string
  private readonly cache: Map<string, ResolvedPrompt> = new Map()
  private staged: ResolvedPrompt[] = []

  constructor(promptsDir: string) {
    this.promptsDir = promptsDir
  }

  /**
   * Scan the prompts directory and load every prompt into memory.
   * Captures any new (capability, version) pairs for archival.
   */
  load(): void {
    this.cache.clear()
    this.staged = []

    if (!existsSync(this.promptsDir)) {
      logger.warn('Prompts directory not found; Intelligence will run without prompts', {
        dir: this.promptsDir,
      })
      return
    }

    const capabilities = readdirSync(this.promptsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

    for (const capability of capabilities) {
      const dir = join(this.promptsDir, capability)
      const files = readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .sort(compareVersions)

      if (files.length === 0) continue

      const latestFile = files[files.length - 1]
      const version = basename(latestFile, '.md')
      const content = readFileSync(join(dir, latestFile), 'utf8')
      const checksum = sha256(content)

      const resolved: ResolvedPrompt = { capability, version, content, checksum }
      this.cache.set(capability, resolved)
      this.staged.push(resolved)

      logger.debug('Loaded prompt', { capability, version, checksum: checksum.slice(0, 8) })
    }
  }

  /**
   * Archive any newly-loaded prompts into `prompt_history`. Idempotent —
   * existing snapshots are not overwritten (onConflictDoNothing).
   */
  async stageSnapshots(repo: IIntelligenceRepository): Promise<void> {
    for (const p of this.staged) {
      await repo.savePromptSnapshot(p.capability, p.version, p.content, p.checksum)
    }
    // Clear staged list so re-calling stageSnapshots is a no-op.
    this.staged = []
  }

  /** Resolve the latest prompt for a capability. Throws if missing. */
  resolve(capability: PromptCapability): ResolvedPrompt {
    const p = this.cache.get(capability)
    if (!p) {
      throw new Error(`No prompt loaded for capability: ${capability}`)
    }
    return p
  }

  /** Returns true if a prompt is loaded for the capability. */
  has(capability: PromptCapability): boolean {
    return this.cache.has(capability)
  }
}

// ── Helpers ────────────────────────────────────────────

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Natural version comparison: v1 < v2 < v10.
 * Falls back to lexical comparison for non-`v<n>` patterns.
 */
function compareVersions(a: string, b: string): number {
  const av = parseVersionNum(a)
  const bv = parseVersionNum(b)
  if (av !== null && bv !== null) return av - bv
  return a.localeCompare(b)
}

function parseVersionNum(filename: string): number | null {
  const match = filename.match(/^v(\d+)\.md$/)
  return match ? Number(match[1]) : null
}
