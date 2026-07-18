import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const CWD = resolve(import.meta.dir, '..')
const WORKSPACE_PKGS = ['.', 'shared', 'backend', 'monkey']
const ENV = {
  ...process.env,
  PATH: [
    ...WORKSPACE_PKGS.map((p) => resolve(CWD, p, 'node_modules/.bin')),
    process.env.PATH ?? '',
  ].join(':'),
}

export interface Result {
  name: string
  ok: boolean
  ms: number
  output: string
  summary?: string
}

export async function spawnCapture(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; output: string }> {
  return new Promise((res) => {
    const child = spawn(cmd, args, {
      cwd,
      env: ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    child.stdout?.on('data', (c: Buffer) => chunks.push(c))
    child.stderr?.on('data', (c: Buffer) => chunks.push(c))
    child.on('error', (err) => {
      res({ code: 1, output: `Failed to spawn ${cmd}: ${err.message}` })
    })
    child.on('close', (code) => {
      res({ code: code ?? 1, output: Buffer.concat(chunks).toString() })
    })
  })
}

export function printResult(r: Result): void {
  const icon = r.ok ? '✓' : '✗'
  const secs = (r.ms / 1000).toFixed(1)
  const summary = r.summary ? `  ${r.summary}` : ''
  console.log(`${icon} ${r.name} (${secs}s)${summary}`)
  if (r.output && !r.ok) {
    const truncated = tailBytes(r.output, 4000)
    for (const line of truncated.split('\n')) {
      console.log(`  ${line}`)
    }
    console.log('')
  }
}

function tailBytes(s: string, n: number): string {
  if (s.length <= n) return s
  return `…\n${s.slice(-n)}`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function globUserJs(distDir: string): string[] {
  if (!existsSync(distDir)) return []
  const results: string[] = []
  function walk(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(resolve(dir, entry.name), rel)
      } else if (entry.name.endsWith('.user.js')) {
        results.push(rel)
      }
    }
  }
  walk(distDir, '')
  return results.sort()
}

export function fileStats(path: string): { size: number; hash: string } {
  return { size: statSync(path).size, hash: sha256File(path) }
}
