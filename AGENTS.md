# Kontexted - AGENTS.md

This file is for AI coding agents working in the Kontexted repository.

## Build / Lint / Test Commands

### Development
- `make dev` - Start both client and server in development mode
- `make dev-client` / `cd apps/client && bun run dev` - Start client only
- `make dev-server` / `cd apps/server && bun run dev` - Start server only

### Build
- `make build` - Build both for production (client + server)
- `make build-client` / `cd apps/client && bun run build` - Build client only
- `make build-server` / `cd apps/server && bun run build` - Build server only
- `make dist` - Build compiled executable distribution for all architectures

### Lint & Typecheck
- `make lint` / `cd apps/client && bun run lint` - Lint client only
- `cd apps/client && npx tsc --noEmit` - Typecheck client
- `cd apps/server && npx tsc --noEmit` - Typecheck server
- `cd apps/cli && bun run lint` - Typecheck CLI

### Test
- `make test` - Run tests for all apps (currently no formal tests configured)
- To run a single test file with Vitest: `cd apps/client && npx vitest run path/to/test.test.ts`
- No test framework configured; add Vitest/Jest when testing needed

### Database (Server)
- `make db-generate` / `cd apps/server && bun run db:generate` - Generate migrations
- `make db-migrate` / `cd apps/server && bun run db:migrate` - Run migrations
- `make db-studio` / `cd apps/server && bun run db:studio` - Open Drizzle Studio
- For SQLite: `bun run db:generate:sqlite`, `bun run db:migrate:sqlite`
- For PostgreSQL: `bun run db:generate:pg`, `bun run db:migrate:pg`

### Docker
- `docker compose up -d` - Start containers in background
- `make docker-build` - Build Docker image
- `make docker-run` - Run Docker container

## Accessing Notes (Three Methods)

### 1. Disk Sync (Recommended for AI Agents)
Pull notes to disk for direct file access with real-time sync:

```bash
# Initialize sync in a project directory
kontexted sync init --alias <profile> --dir .

# Start sync daemon with file watching
kontexted sync start --daemon

# Sync creates .kontexted/ directory (gitignored)
# A .ignore file with negation pattern allows LLM tools to reference files
```

The sync daemon watches for file changes and syncs bidirectionally with the server. Notes appear as markdown files at `.kontexted/folder/note.md`.

### 2. MCP (Model Context Protocol)
For AI assistants that support MCP:

```bash
kontexted mcp --alias <profile> [--write]
```

### 3. CLI Skill Commands
Direct CLI access for workspace operations:

```bash
kontexted skill workspace-tree --alias <profile>
kontexted skill search-notes --alias <profile> --query "<text>"
kontexted skill note-by-id --alias <profile> --note-id <id>
kontexted skill create-note --alias <profile> --name <slug> --title "<title>"
kontexted skill update-note-content --alias <profile> --note-id <id> --content "<content>"
```

## Code Style Guidelines

### Project Structure
- Monorepo with bun workspaces
- `apps/client` - Vite + React 19 + TypeScript + Tailwind CSS
- `apps/server` - Hono + Bun + TypeScript + Drizzle ORM
- `apps/cli` - Commander-based CLI for sync, MCP proxy, workspace management
- Supports PostgreSQL (production) and SQLite (local dev)

### TypeScript Configuration
- Strict mode enabled in all apps
- Target: ES2022, Module: ESNext
- Path alias `@/*` maps to `./src/*` in each app
- `noUnusedLocals: true`, `noUnusedParameters: true` (client)
- No fallback to `any` for type errors (strict mode)

### Imports
- Use `@/*` for absolute imports within each app (`import { db } from "@/db"`)
- External libraries first, then local modules
- Named imports preferred over default imports
- Group imports: external packages, then internal aliases, then relative

### Naming Conventions
- Variables and functions: camelCase (`workspaceSlug`, `getWorkspace`)
- Components: PascalCase (`NoteEditor`, `WorkspaceShell`)
- Classes: PascalCase (`ApiClient`, `UnauthorizedError`)
- Constants: UPPER_SNAKE_CASE (`STATUS_CONNECTED`)
- React hooks: `use` prefix (`useQuery`, `useMutation`, `useEffect`)
- Query functions: descriptive names (`noteQueryOptions`, `workspaceQueryKeys`)
- Type interfaces: PascalCase (`NoteBody`, `Variables`, `Session`)
- File names: match their exports (`note-editor.tsx`, `api-client.ts`)

### File Organization (Client)
- `src/components/` - React components grouped by feature or type
- `src/components/ui/` - shadcn/ui components
- `src/features/*/` - Feature-specific code (auth, notes, workspaces)
- `src/features/*/queries.ts` - TanStack Query query options
- `src/features/*/mutations.ts` - TanStack Query mutation hooks
- `src/lib/` - Shared utilities and helpers
- `src/stores/` - Zustand state management

### File Organization (Server)
- `src/routes/` - Hono route handlers grouped by feature
- `src/routes/middleware/` - Hono middleware (auth, etc.)
- `src/db/schema/` - Drizzle schema definitions (postgresql/ and sqlite/)
- `src/lib/` - Shared utilities and helpers

### React Patterns
- Functional components with hooks only
- TanStack Router for client-side routing
- TanStack Query for data fetching and caching
- Zustand for global state (UI state, etc.)
- shadcn/ui component library (Radix UI primitives)
- Tailwind CSS for styling with `cn()` helper from `@/lib/utils`
- Explicitly type all props with interfaces

### Error Handling
- Use custom error classes for domain errors (e.g., `UnauthorizedError`)
- Type guards for unknown request bodies: `isRecord(value: unknown)`
- Server API responses: `c.json({ error: "message" }, status)`
- Client API responses: `{ error?: string, data?: T, status: number }`

### API Design (Server)
- RESTful API design with Hono
- Route groups: `/api/workspaces/*`, `/api/sync/*`, `/api/collab/*`
- Use `requireAuth` middleware for protected routes
- Type Hono context with `Variables` interface for `session` and `db`
- Use Drizzle ORM with proper types from schema

### Database Patterns
- Drizzle ORM with schema files in `src/db/schema/`
- Separate schemas for PostgreSQL and SQLite (dialects)
- Schema selection via `DATABASE_DIALECT` env var (defaults to sqlite)
- Import schema from `@/db/schema` which auto-selects dialect

### Environment Variables
- Server: see `apps/server/.env.example`
- Use `process.env.VARIABLE_NAME` for server
- Use `import.meta.env.VARIABLE_NAME` for client (Vite)

### Bun Version
- Minimum Bun: 1.0.0

### Key Libraries
- Client: React 19, TanStack Router, TanStack Query, Zustand, Lucide React
- Server: Hono, Drizzle ORM, Better Auth, Yjs, MCP SDK
- CLI: Commander, chokidar (file watching), MCP SDK
- UI: Radix UI primitives, Tailwind CSS, CodeMirror for editor
