import { extname, resolve } from 'node:path'
import { buildFormatArgs, filterIgnoredFiles } from './configs'
import { CHECKABLE_EXTS, getChangedFiles, getTrackedFiles } from './git'
import { printResult, type Result, spawnCapture } from './runner'

const CWD = resolve(import.meta.dir, '..')

async function main(): Promise<void> {
  const full = process.argv.includes('--full')
  const allFiles = full ? getTrackedFiles() : getChangedFiles()
  const formattableFiles = filterIgnoredFiles(
    allFiles.filter((f) => CHECKABLE_EXTS.has(extname(f))),
  )

  if (formattableFiles.length === 0) {
    console.log(full ? 'no formattable files' : 'no changes to format')
    process.exit(0)
  }

  const start = performance.now()
  const args = buildFormatArgs(formattableFiles, 'write')
  const { code, output } = await spawnCapture('oxfmt', args, CWD)
  const ms = performance.now() - start

  const result: Result = {
    name: 'format',
    ok: code === 0,
    ms,
    output: code === 0 ? '' : output,
    summary: `${formattableFiles.length} files`,
  }
  printResult(result)
  process.exit(code === 0 ? 0 : 1)
}

main()
