export interface AppConfig {
  port: number
  databasePath: string
  logLevel: string
}

/**
 * Reads configuration from environment variables.
 * Environment variables are read only during startup.
 */
export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    databasePath: process.env.DATABASE_PATH ?? './data/gleam.sqlite',
    logLevel: process.env.LOG_LEVEL ?? 'info',
  }
}
