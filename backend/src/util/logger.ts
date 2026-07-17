/**
 * Structured logging. V1 uses a simple console-based logger.
 * Each log entry is a JSON object with timestamp, level, and message.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

let currentLevel: LogLevel = 'info'

export function setLogLevel(level: string): void {
  if (level in LEVEL_PRIORITY) {
    currentLevel = level as LogLevel
  }
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ?? {}),
  }

  const output = JSON.stringify(entry)
  if (level === 'error' || level === 'warn') {
    console.error(output)
  } else {
    console.log(output)
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
}
