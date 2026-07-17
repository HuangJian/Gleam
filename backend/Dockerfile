FROM oven/bun:1 AS base
WORKDIR /app

# Copy package files and install dependencies
COPY backend/package.json backend/bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source
COPY shared/ ./shared/
COPY backend/src/ ./src/
COPY backend/drizzle.config.ts ./

# Create data directory
RUN mkdir -p /app/data

# Environment
ENV PORT=3000
ENV DATABASE_PATH=/app/data/gleam.sqlite
ENV LOG_LEVEL=info

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "bun run src/database/migrate.ts && bun run src/main.ts"]
