import { createYoga } from 'graphql-yoga'
import { schema } from './graphql/schema'
import { initDatabase } from './database'
import { SqliteRepository } from './repository/sqlite-repository'
import { TimelineService } from './timeline/timeline'
import { SearchService } from './search/search'
import { loadConfig } from './config'
import { logger, setLogLevel } from './util/logger'
import type { GraphQLContext } from './graphql/schema'

async function main() {
  const config = loadConfig()
  setLogLevel(config.logLevel)

  logger.info('Starting Gleam backend', { port: config.port, database: config.databasePath })

  const { db, sqlite } = initDatabase(config.databasePath)

  const repository = new SqliteRepository(db, sqlite)
  const timelineService = new TimelineService(repository)
  const searchService = new SearchService(repository)

  const context = (): GraphQLContext => ({
    repository,
    timelineService,
    searchService,
  })

  const yoga = createYoga({
    schema,
    context,
    graphqlEndpoint: '/graphql',
    landingPage: false,
  })

  const server = Bun.serve({
    port: config.port,
    fetch: yoga,
  })

  logger.info('Gleam backend is running', { url: `http://localhost:${server.port}/graphql` })
}

main().catch((error) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
