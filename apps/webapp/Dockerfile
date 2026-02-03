FROM node:24.13-alpine AS builder
RUN npm install -g pnpm@latest
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/kontexted-db ./packages/kontexted-db
COPY apps/webapp ./apps/webapp
COPY apps/collab ./apps/collab

RUN pnpm install --frozen-lockfile --prod=false

ENV DATABASE_DIALECT=sqlite
ENV DATABASE_URL=:memory:

RUN pnpm --filter @kontexted/webapp build

FROM node:24.13-alpine AS migrate-deps
WORKDIR /migrate

RUN apk add --no-cache python3 make g++
RUN npm init -y
RUN npm install --omit=dev pg@8.17.1 drizzle-orm@0.45.1 dotenv@17.2.3 better-sqlite3@12.6.2

FROM node:24.13-alpine
WORKDIR /app
RUN apk add --no-cache postgresql-client

COPY --from=builder /app/apps/webapp/.next/standalone ./
COPY --from=builder /app/apps/webapp/.next/static ./apps/webapp/.next/static
COPY --from=builder /app/apps/webapp/public ./apps/webapp/public
COPY --from=builder /app/apps/webapp/src/db/migrate.mjs ./apps/webapp/src/db/migrate.mjs
COPY --from=builder /app/apps/webapp/src/db/migrations ./apps/webapp/src/db/migrations
COPY --from=migrate-deps /migrate/node_modules ./apps/webapp/src/db/node_modules
COPY apps/webapp/docker-entrypoint.sh ./apps/webapp/

RUN chmod +x ./apps/webapp/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["./apps/webapp/docker-entrypoint.sh"]
