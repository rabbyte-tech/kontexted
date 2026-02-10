# Kontexted - AGENTS.md

This file is for AI coding agents working in the Kontexted repository.

## Build / Lint / Test Commands

### Development
- `make dev` / `cd apps/client && npm run dev` / `cd apps/server && bun run dev`
- `make dev-client` / `make dev-server` - Start single app

### Build
- `make build` - Build both for production
- `make build-client` / `make build-server` - Build single app

### Lint & Test
- `make lint` / `cd apps/client && npm run lint` - Lint client only
- No test framework configured; add Vitest/Jest when testing needed

### Database (Server)
- `make db-generate` / `make db-migrate` / `make db-studio`
- Or `cd apps/server && bun run db:{generate|migrate|studio}`

### Docker
- `docker compose up -d`, `make docker-build`, `make docker-run`

## Code Style Guidelines

### Project Structure
- Monorepo with pnpm workspaces
- `apps/client` - Vite + React 19 + TypeScript + Tailwind CSS
- `apps/server` - Hono + Bun + TypeScript + Drizzle ORM
- Supports PostgreSQL (production) and SQLite (local dev)

### TypeScript Configuration
- Strict mode enabled in both client and server
- Target: ES2022, Module: ESNext
- Path alias `@/*` maps to `./src/*` in each app
- Includes `bun-types` in lib for Bun API types
- No unused locals/parameters allowed (client: tsconfig)
- No fallback to `any` for type errors (strict mode)

### Imports
- Use `@/*` for absolute imports within each app (`import { db } from "@/db"`)
- External libraries first, then local modules
- Named imports preferred over default imports

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
- `src/features/*/queries.ts` - TanStack Query queries
- `src/features/*/mutations.ts` - TanStack Query mutations
- `src/lib/` - Shared utilities and helpers
- `src/stores/` - Zustand state management
- `src/router/` - TanStack Router configuration
- `src/types/` - TypeScript type definitions

### File Organization (Server)
- `src/routes/` - Hono route handlers grouped by feature
- `src/routes/*/` - Feature-specific route files
- `src/routes/middleware/` - Hono middleware (auth, etc.)
- `src/db/schema/` - Drizzle schema definitions (postgres and sqlite)
- `src/lib/` - Shared utilities and helpers
- `src/collab-ws/` - WebSocket collaboration logic

### React Patterns
- Functional components with hooks only
- TanStack Router for client-side routing
- TanStack Query for data fetching and caching
- Zustand for global state (UI state, etc.)
- shadcn/ui component library (Radix UI primitives)
- Tailwind CSS for styling with `cn()` helper
- Use `clsx` + `tailwind-merge` via `cn()` for conditional classes
- Explicitly type all props with interfaces

### Error Handling
- Use custom error classes for domain errors (e.g., `UnauthorizedError`)
- Type guards for unknown request bodies: `isRecord(value: unknown)`
- Throw `Error` objects with descriptive messages
- Server API responses: `c.json({ error: "message" }, status)`
- Client API responses: `{ error?: string, data?: T, status: number }`

### API Design (Server)
- RESTful API design with Hono
- Route groups: `/api/workspaces/*`, `/api/collab/*`, `/api/config/*`
- Use `requireAuth` middleware for protected routes
- Type Hono context with `Variables` interface for `session` and `db`
- Use Drizzle ORM with proper types from schema
- Return JSON responses with appropriate HTTP status codes
- Use SSE (Server-Sent Events) for real-time updates

### Database Patterns
- Drizzle ORM with schema files in `src/db/schema/`
- Separate schemas for PostgreSQL and SQLite (dialects)
- Use `drizzle-kit` for migrations: `bun run db:generate`
- Migrate with `bun run db:migrate`
- Use `eq()`, `and()`, `orderBy()` from `drizzle-orm`
- Support both PostgreSQL and SQLite via `DATABASE_DIALECT` env var

### Type Safety
- Zod for runtime validation (schema definitions)
- Explicit typing for all route parameters and bodies
- Use TypeScript generics for type-safe API responses
- Type guards for narrowing unknown types
- Avoid `any` except where absolutely necessary

### Comments and Documentation
- JSDoc comments for public functions and classes
- Explain complex logic or non-obvious patterns
- Keep comments concise and up-to-date
- No inline comments for obvious code

### Folder and Note Names
- Valid patterns: kebab-case, camelCase, snake_case, PascalCase
- Validated by `isValidFolderName()` utility

### Environment Variables
- Server: see `apps/server/.env.example`
- Client: see `apps/client/.env.example`
- Use `process.env.VARIABLE_NAME` for server
- Use `import.meta.env.VARIABLE_NAME` for client (Vite)

### ESLint Rules (Client)
- TypeScript ESLint with recommended rules
- React Hooks ESLint for hook dependency warnings
- `@typescript-eslint/no-unused-vars`: Error (ignore `_` prefix)
- `@typescript-eslint/no-explicit-any`: Off
- `react-hooks/exhaustive-deps`: Off (reserved for later cleanup)
- `react-refresh/only-export-components`: Warn

### Bun Version
- Minimum Bun: 1.0.0
- Check `apps/server/package.json` engines field

### Auth
- Better Auth for authentication (email/password or Keycloak OAuth)
- Session-based auth with JWT tokens
- `requireAuth` middleware for protected routes
- Token validation on WebSocket connections

### WebSocket / Collaboration
- Yjs CRDT for real-time collaboration
- Hono WebSocket adapter for server
- Room-based collaboration with document checkpoints
- Manual-save mode when collab server is unavailable

### Key Libraries
- Client: React 19, TanStack Router, TanStack Query, Zustand, Lucide React
- Server: Hono, Drizzle ORM, Better Auth, Yjs, jose (JWT)
- UI: Radix UI primitives, Tailwind CSS, CodeMirror for editor
