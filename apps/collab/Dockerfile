FROM node:24.13-alpine AS deps
RUN npm install -g pnpm@latest
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/kontexted-db ./packages/kontexted-db
COPY apps/collab ./apps/collab

RUN pnpm install --frozen-lockfile --prod --filter @kontexted/collab...

FROM node:24.13-alpine
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/collab ./apps/collab
COPY --from=deps /app/packages/kontexted-db ./packages/kontexted-db

WORKDIR /app/apps/collab
ENV NODE_ENV=production
EXPOSE 8787

CMD ["./node_modules/.bin/tsx", "src/server.ts"]
