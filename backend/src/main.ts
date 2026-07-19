import { createYoga } from 'graphql-yoga'
import { schema } from './graphql/schema'
import { initDatabase } from './database'
import { SqliteRepository } from './repository/sqlite-repository'
import { TimelineService } from './timeline/timeline'
import { SearchService } from './search/search'
import { loadConfig } from './config'
import { logger, setLogLevel } from './util/logger'
import type { GraphQLContext } from './graphql/schema'
import { PromptRegistry } from './intelligence/prompt-registry'
import { ObservationPipeline } from './intelligence/pipeline'
import { Scheduler } from './intelligence/scheduler'
import { hasEncryptionSecret } from './config/encryption'

async function main() {
  const config = loadConfig()
  setLogLevel(config.logLevel)

  logger.info('Starting Gleam backend', { port: config.port, database: config.databasePath })

  const { db, sqlite } = initDatabase(config.databasePath)

  const repository = new SqliteRepository(db, sqlite)
  const timelineService = new TimelineService(repository)
  const searchService = new SearchService(repository)

  // ── Intelligence subsystem ──────────────────────────
  //
  // Startup sequence (per plan §11):
  //   1. Load Prompt Registry (scan prompts/ directory).
  //   2. Stage prompt snapshots into prompt_history (idempotent).
  //   3. Construct Observation Pipeline + Scheduler.
  //   4. Scheduler.start() performs stale-running recovery, then
  //      begins polling.
  //
  // Repository startup never waits for pending semantic work to
  // complete — observation resumes gradually after initialization.
  const promptRegistry = new PromptRegistry(config.promptsDir)
  promptRegistry.load()
  await promptRegistry.stageSnapshots(repository)

  const pipeline = new ObservationPipeline(
    repository,
    promptRegistry,
    config.relationThreshold,
    config.relationLimit,
  )

  const scheduler = new Scheduler(
    repository,
    repository,
    pipeline,
    config.schedulerIntervalMs,
    config.schedulerBatchSize,
  )

  if (!hasEncryptionSecret()) {
    logger.warn(
      'GLEAM_BACKEND_SECRET is not set — Intelligence provider configuration will be unavailable. ' +
        'Set GLEAM_BACKEND_SECRET to enable LLM-based semantic observation.',
    )
  }

  // Start the scheduler only after the HTTP server is listening so that
  // health checks succeed before background work begins.
  const context = (): GraphQLContext => ({
    repository,
    intelligenceRepository: repository,
    timelineService,
    searchService,
  })

  const yoga = createYoga({
    schema,
    context,
    graphqlEndpoint: '/graphql',
    landingPage: false,
    // Allow cross-origin requests so the UserScript (and browser-based testing)
    // can reach the GraphQL endpoint. GM_xmlhttpRequest bypasses CORS, but
    // enabling it here allows direct browser fetch for development/testing.
    cors: {
      origin: ['*'],
      methods: ['POST', 'GET', 'OPTIONS'],
    },
  })

  const server = Bun.serve({
    port: config.port,
    fetch: yoga,
  })

  // Begin background observation now that the server is ready.
  scheduler.start()

  logger.info('Gleam backend is running', { url: `http://localhost:${server.port}/graphql` })
}

main().catch((error) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
