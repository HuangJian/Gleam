FROM oven/bun:1 AS base
WORKDIR /app

# Copy workspace manifests and install the whole workspace (hoists @gleam/shared
# into node_modules so backend can resolve it via the package "exports" field).
COPY package.json bun.lock* ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
RUN bun install --frozen-lockfile

# Copy source
COPY shared/ ./shared/
COPY backend/src/ ./backend/src/
COPY backend/drizzle.config.ts ./backend/drizzle.config.ts

# Create data directory
RUN mkdir -p /app/data

# Environment
ENV PORT=3000
ENV DATABASE_PATH=/app/data/gleam.sqlite
ENV LOG_LEVEL=info

WORKDIR /app/backend

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "bun run src/database/migrate.ts && bun run src/main.ts"]
