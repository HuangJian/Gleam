export interface AppConfig {
  port: number
  databasePath: string
  logLevel: string
  /** Directory containing versioned prompt files. Defaults to `./prompts`. */
  promptsDir: string
  /**
   * Polling interval (ms) for the Intelligence Scheduler.
   * Defaults to 30s. Latency is intentionally measured in seconds —
   * semantic observation is a background activity.
   */
  schedulerIntervalMs: number
  /**
   * Cosine similarity threshold for AI-generated semantic_proximity
   * relations. Pairs below this threshold are not stored.
   */
  relationThreshold: number
  /** Maximum number of relations stored per Gleam. */
  relationLimit: number
  /** Maximum number of pending artifacts processed per Scheduler tick. */
  schedulerBatchSize: number
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
    promptsDir: process.env.PROMPTS_DIR ?? './prompts',
    schedulerIntervalMs: Number(process.env.SCHEDULER_INTERVAL_MS ?? 30_000),
    relationThreshold: Number(process.env.RELATION_THRESHOLD ?? 0.75),
    relationLimit: Number(process.env.RELATION_LIMIT ?? 20),
    schedulerBatchSize: Number(process.env.SCHEDULER_BATCH_SIZE ?? 10),
  }
}
