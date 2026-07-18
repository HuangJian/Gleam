import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CWD = resolve(import.meta.dir, '..')

const OXLINT_CONFIG = resolve(CWD, 'config/oxlintrc.json')
const OXFMT_CONFIG = resolve(CWD, 'config/oxfmtrc.json')

export function buildLintArgs(files: string[]): string[] {
  return ['-c', OXLINT_CONFIG, ...files]
}

export function buildFormatArgs(files: string[], mode: 'check' | 'write'): string[] {
  const base = ['-c', OXFMT_CONFIG, '--disable-nested-config']
  return mode === 'check' ? [...base, '--check', ...files] : [...base, ...files]
}

/** Convert a gitignore-style glob pattern to a RegExp. */
function globToRegex(pattern: string): RegExp {
  const parts = pattern.split('**')
  const escaped = parts.map((p) => p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
  return new RegExp(`^${escaped.join('.*')}$`)
}

/**
 * Filter files by the `ignorePatterns` field in `config/oxfmtrc.json`.
 * oxfmt's own ignorePatterns handling is buggy (oxc#24276, oxc#22066),
 * so we read the config and apply the patterns ourselves.
 */
export function filterIgnoredFiles(files: string[]): string[] {
  const config = JSON.parse(readFileSync(OXFMT_CONFIG, 'utf8'))
  const patterns: string[] = config.ignorePatterns ?? []
  if (patterns.length === 0) return files
  const regexes = patterns.map(globToRegex)
  return files.filter((f) => !regexes.some((re) => re.test(f)))
}
