import { spawnCapture } from './runner'

export interface TestResult {
  ok: boolean
  summary: string
  detail: string
}

interface Failure {
  file: string
  testName: string
}

function parseFailures(output: string): Failure[] {
  const lines = output.split('\n')
  const fileRe = /^(.+\.test\.[tj]sx?):/
  const failRe = /^\(fail\)\s+(.+?)\s+\[[\d.]+ms\]/
  const failures: Failure[] = []
  let currentFile = ''

  for (const line of lines) {
    const t = line.trim()
    if (/^\d+ pass/.test(t) || /\d+ fail/.test(t)) break
    const fm = t.match(fileRe)
    if (fm) {
      currentFile = fm[1]
      continue
    }
    const xm = t.match(failRe)
    if (xm && currentFile) {
      const full = xm[1]
      const testName = full.includes('>') ? full.split('>').pop()!.trim() : full
      failures.push({ file: currentFile, testName })
    }
  }
  return failures
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractSummary(output: string): string {
  const passMatch = output.match(/(\d+)\s+pass/)
  const failMatch = output.match(/(\d+)\s+fail/)
  const skipMatch = output.match(/(\d+)\s+skip/)
  const parts: string[] = []
  if (passMatch) parts.push(`${passMatch[1]} pass`)
  if (failMatch) parts.push(`${failMatch[1]} fail`)
  if (skipMatch) parts.push(`${skipMatch[1]} skip`)
  return parts.join(', ') || 'unknown'
}

/** Run `bun test` silently; on failure, re-run each failing test to capture detail. */
export async function runSilentTest(cwd: string, label: string): Promise<TestResult> {
  const first = await spawnCapture('bun', ['test'], cwd)
  const summary = extractSummary(first.output)
  const failures = parseFailures(first.output)

  if (first.code === 0 && failures.length === 0) {
    return { ok: true, summary, detail: '' }
  }

  let detail = `${label}:\n${summary}\n`
  for (const f of failures) {
    detail += `\n--- ${f.testName} ---\n`
    const r = await spawnCapture('bun', ['test', '-t', escapeRegex(f.testName), f.file], cwd)
    detail += r.output + '\n'
  }
  return { ok: false, summary, detail }
}
