import { defineConfig } from 'drizzle-kit'

const dbPath = process.env.DATABASE_PATH ?? './data/gleam.sqlite'

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
})
