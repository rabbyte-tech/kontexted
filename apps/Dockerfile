# Stage 1: Build client
FROM oven/bun:1.3.6-alpine AS client-builder

WORKDIR /client

# Copy client package files
COPY apps/client/package.json apps/client/bun.lock ./

# Install client dependencies
RUN bun install --frozen-lockfile

# Copy client source
COPY apps/client/ .

# Build client (outputs to dist/)
RUN bun run build


# Stage 2: Build server
FROM oven/bun:1.3.6-alpine AS server-builder

WORKDIR /server

# Copy server package files
COPY apps/server/package.json apps/server/bun.lock ./

# Install server dependencies
RUN bun install --frozen-lockfile

# Copy server source
COPY apps/server/ .

# Build server (outputs to dist/)
RUN bun run build

# Copy client dist into server build output
COPY --from=client-builder /client/dist ./dist/public


# Stage 3: Runtime - ONLY server runtime dependencies
FROM oven/bun:1.3.6-alpine

WORKDIR /app

# Copy server package files
COPY apps/server/package.json apps/server/bun.lock ./

# Install only production dependencies
RUN bun install --frozen-lockfile --production

# Copy server build output (includes client dist in public/)
COPY --from=server-builder /server/dist ./dist

# Copy docker-entrypoint.sh
COPY apps/server/docker-entrypoint.sh ./docker-entrypoint.sh

# Make entrypoint executable
RUN chmod +x ./docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD bun -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1))"

# Set entrypoint
ENTRYPOINT ["./docker-entrypoint.sh"]
