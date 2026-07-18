import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const CWD = resolve(import.meta.dir, '..')

/** Extensions oxfmt can format (broader than oxlint). */
export const CHECKABLE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.md',
  '.yaml',
  '.yml',
])

/** Extensions oxlint can lint (JS/TS only). */
export const LINTABLE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

/** Files changed vs HEAD (staged + unstaged) plus untracked. Returns [] on git errors. */
export function getChangedFiles(): string[] {
  try {
    const tracked = execSync('git diff --name-only HEAD --diff-filter=ACMR', {
      cwd: CWD,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean)

    const untracked = execSync('git ls-files --others --exclude-standard', {
      cwd: CWD,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean)

    return [...new Set([...tracked, ...untracked])].filter((f) => existsSync(resolve(CWD, f)))
  } catch {
    return []
  }
}

/** All tracked files (for --full mode). */
export function getTrackedFiles(): string[] {
  try {
    return execSync('git ls-files', {
      cwd: CWD,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter((f) => existsSync(resolve(CWD, f)))
  } catch {
    return []
  }
}

export interface Scope {
  packages: string[]
  reason: string
}

function isGlobalFile(file: string): boolean {
  if (
    file === 'package.json' ||
    file === 'tsconfig.base.json' ||
    file === 'AGENTS.md' ||
    file === 'bun.lock' ||
    file === '.gitignore'
  ) {
    return true
  }
  return file.startsWith('scripts/') || file.startsWith('config/')
}

/** Map changed files to affected packages (shared → all, since backend & monkey depend on it). */
export function determineAffectedPackages(files: string[]): Scope {
  const affected = new Set<string>()
  for (const file of files) {
    if (isGlobalFile(file)) {
      return { packages: ['shared', 'backend', 'monkey'], reason: `global change: ${file}` }
    }
    const pkg = file.split('/')[0]
    if (pkg === 'shared') {
      affected.add('shared')
      affected.add('backend')
      affected.add('monkey')
    } else if (pkg === 'backend') {
      affected.add('backend')
    } else if (pkg === 'monkey') {
      affected.add('monkey')
    }
    // doc/, plan/, asset/, data/, LICENSE — no package affected
  }
  const packages = [...affected].sort()
  return {
    packages,
    reason: packages.length > 0 ? packages.join(', ') : 'no affected packages',
  }
}

export function hasTests(pkg: string): boolean {
  return existsSync(resolve(CWD, pkg, 'src/__tests__'))
}
