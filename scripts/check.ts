import { extname, resolve } from 'node:path'
import { buildFormatArgs, buildLintArgs, filterIgnoredFiles } from './configs'
import {
  determineAffectedPackages,
  getChangedFiles,
  getTrackedFiles,
  hasTests,
  LINTABLE_EXTS,
  CHECKABLE_EXTS,
} from './git'
import {
  fileStats,
  formatBytes,
  globUserJs,
  printResult,
  type Result,
  spawnCapture,
} from './runner'
import { runSilentTest } from './test-silent'

const CWD = resolve(import.meta.dir, '..')
const PACKAGES = ['shared', 'backend', 'monkey'] as const
const TOOLS_CONFIG = resolve(CWD, 'tsconfig.json')

async function runTypecheck(): Promise<Result> {
  const start = performance.now()
  const subResults = await Promise.all([
    ...PACKAGES.map(async (pkg) => {
      const r = await spawnCapture('tsc', ['--noEmit', '--incremental'], resolve(CWD, pkg))
      return { label: pkg, ok: r.code === 0, output: r.output }
    }),
    (async () => {
      const r = await spawnCapture('tsc', ['--noEmit', '--incremental', '-p', TOOLS_CONFIG], CWD)
      return { label: 'tools', ok: r.code === 0, output: r.output }
    })(),
  ])
  const ms = performance.now() - start
  const failed = subResults.filter((r) => !r.ok)
  return {
    name: 'typecheck',
    ok: failed.length === 0,
    ms,
    output: failed.map((r) => `--- ${r.label} ---\n${r.output}`).join('\n'),
  }
}

async function runLint(files: string[]): Promise<Result> {
  const start = performance.now()
  const args = buildLintArgs(files)
  const { code, output } = await spawnCapture('oxlint', args, CWD)
  const ms = performance.now() - start
  return {
    name: 'lint',
    ok: code === 0,
    ms,
    output: code === 0 ? '' : output,
    summary: `${files.length} files`,
  }
}

async function runFormat(files: string[]): Promise<Result> {
  const start = performance.now()
  const args = buildFormatArgs(files, 'write')
  const { code, output } = await spawnCapture('oxfmt', args, CWD)
  const ms = performance.now() - start
  return {
    name: 'format',
    ok: code === 0,
    ms,
    output: code === 0 ? '' : output,
    summary: `${files.length} files`,
  }
}

async function runTest(packages: string[]): Promise<Result> {
  const start = performance.now()
  const testable = packages.filter((p) => hasTests(p))
  const subResults = await Promise.all(
    testable.map(async (pkg) => {
      const r = await runSilentTest(resolve(CWD, pkg), pkg)
      return { pkg, ...r }
    }),
  )
  const ms = performance.now() - start
  const allOk = subResults.every((r) => r.ok)
  const summaries = subResults.map((r) => `${r.pkg}: ${r.summary}`).join(' · ')
  const details = subResults
    .filter((r) => !r.ok)
    .map((r) => r.detail)
    .join('\n')
  return {
    name: 'test',
    ok: allOk,
    ms,
    output: details,
    summary: summaries,
  }
}

async function runBuild(): Promise<Result> {
  const start = performance.now()
  const { code, output } = await spawnCapture('vite', ['build'], resolve(CWD, 'monkey'))
  const ms = performance.now() - start

  if (code !== 0) {
    return { name: 'build', ok: false, ms, output }
  }

  const distDir = resolve(CWD, 'monkey/dist')
  const artifacts = globUserJs(distDir).map((rel) => {
    const stats = fileStats(resolve(distDir, rel))
    const hashShort = stats.hash.slice(0, 16)
    return `${rel}  ${formatBytes(stats.size)}  sha256:${hashShort}…`
  })

  return {
    name: 'build',
    ok: true,
    ms,
    output: '',
    summary: artifacts.join('  ') || 'no output',
  }
}

async function main(): Promise<void> {
  const full = process.argv.includes('--full')
  const totalStart = performance.now()

  const allFiles = full ? getTrackedFiles() : getChangedFiles()

  if (!full && allFiles.length === 0) {
    console.log('no changes, nothing to check')
    process.exit(0)
  }

  const scope = determineAffectedPackages(allFiles)
  const lintableFiles = allFiles.filter((f) => LINTABLE_EXTS.has(extname(f)))
  const formattableFiles = filterIgnoredFiles(
    allFiles.filter((f) => CHECKABLE_EXTS.has(extname(f))),
  )

  // Header
  const scopeLabel = full ? 'full (--full)' : `${allFiles.length} changed → ${scope.reason}`
  console.log(`Scope: ${scopeLabel}`)
  console.log(
    `  lint: ${lintableFiles.length} files · format: ${formattableFiles.length} files · test: ${scope.packages.filter(hasTests).join(', ') || 'none'} · build: ${scope.packages.includes('monkey') ? 'monkey' : 'skip'}`,
  )
  console.log('')

  const results: Result[] = []

  // Phase 1: format (--write) — runs alone to avoid read/write races with other steps.
  if (formattableFiles.length > 0) {
    const formatResult = await runFormat(formattableFiles)
    printResult(formatResult)
    results.push(formatResult)
  }

  // Phase 2: typecheck + lint + test + build — all parallel.
  const parallelSteps: Promise<Result>[] = []
  parallelSteps.push(runTypecheck())
  if (lintableFiles.length > 0) parallelSteps.push(runLint(lintableFiles))
  if (scope.packages.some((p) => hasTests(p))) parallelSteps.push(runTest(scope.packages))
  if (scope.packages.includes('monkey')) parallelSteps.push(runBuild())

  await Promise.all(
    parallelSteps.map(async (p) => {
      const r = await p
      printResult(r)
      results.push(r)
    }),
  )

  // Summary
  const allOk = results.every((r) => r.ok)
  const totalSecs = ((performance.now() - totalStart) / 1000).toFixed(1)
  if (allOk) {
    console.log(`\n✓ All checks passed in ${totalSecs}s`)
  } else {
    const failed = results.filter((r) => !r.ok).map((r) => r.name)
    console.log(`\n✗ ${failed.join(', ')} failed in ${totalSecs}s`)
  }
  process.exit(allOk ? 0 : 1)
}

main()
