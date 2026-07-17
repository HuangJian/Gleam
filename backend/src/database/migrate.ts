import { initDatabase } from './index'
import { logger } from '../util/logger'

const dbPath = process.env.DATABASE_PATH ?? './data/gleam.sqlite'

logger.info('Running migrations', { database: dbPath })
initDatabase(dbPath)
logger.info('Migrations complete')
