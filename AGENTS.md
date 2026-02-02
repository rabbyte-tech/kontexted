# Agent Notes for Kontexted

## Purpose
- This file is for agentic coding assistants working in this repo.
- Follow these guidelines when editing, running commands, or adding files.
- Prefer minimal, focused changes that match existing patterns.

## Repository Layout
- Monorepo managed by Bun workspaces.
- `apps/webapp`: Next.js 16 app (React 19, TypeScript).
- `apps/collab`: Bun + Hono websocket server.
- `packages/kontexted-db`: Shared Drizzle schema exports.
- `opencode.json`: Opencode config (do not edit unless asked).

## Tooling and Package Manager
- Use Bun (`bun`) for running scripts and installing dependencies.
- Workspace scripts are run from repo root with `bun run`.
- App-level scripts can be run with `bun run --cwd <path>`.

## Build and Dev Commands
- Install dependencies: `bun install` (from repo root).
- Dev webapp: `bun run dev:webapp` (root) or `bun run --cwd apps/webapp dev`.
- Dev collab server: `bun run dev:collab` (root) or `bun run --cwd apps/collab dev`.
- Start webapp (prod): `bun run start:webapp` (root) or `bun run --cwd apps/webapp start`.
- Start collab (prod): `bun run --cwd apps/collab start`.
- Build webapp: `bun run build:webapp` (root) or `bun run --cwd apps/webapp build`.

## Lint Commands
- Webapp lint: `bun run --cwd apps/webapp lint`.
- No lint script is configured for `apps/collab` or `packages/kontexted-db`.

## Database Commands (webapp)
- Generate migrations: `bun run --cwd apps/webapp db:generate`.
- Run migrations: `bun run --cwd apps/webapp db:migrate` or `bun run db:migrate` (root).
- Push schema: `bun run --cwd apps/webapp db:push`.
- Studio: `bun run --cwd apps/webapp db:studio`.

## Test Commands
- No test runner is configured in this repo (no `test` scripts or test files).
- There is no documented single-test command yet.
- If tests are added, document the runner and how to run one test here.

## Environment Files
- Webapp env examples: `apps/webapp/.env.example`.
- Collab env examples: `apps/collab/.env.example`.
- Local env files exist: `apps/webapp/.env`, `apps/collab/.env`.

## TypeScript and Module Style
- TypeScript is `strict` in both apps.
- ESM modules are used (`type: module` in collab, Next.js defaults in webapp).
- Prefer `const` for values and functions; use `let` only when reassigned.
- Keep types explicit when crossing boundaries (request payloads, DB results).

## Imports and Exports
- Order imports: external packages first, blank line, internal aliases, then relatives.
- Use `import type` for type-only imports when possible.
- Webapp path alias: `@/*` maps to `apps/webapp/src/*`.
- Avoid deep relative paths when alias is available.

## Formatting Conventions
- Indentation is 2 spaces throughout the codebase.
- Semicolon usage is mixed; match the file’s existing style.
- Shadcn-style UI components omit semicolons and favor compact formatting.
- Next.js app and API files generally include semicolons; follow local norms.
- Quote style varies (single vs double); keep existing file style.
- Keep lines readable; break long argument lists across lines as seen in repo.

## Styling and CSS (webapp)
- Tailwind CSS v4 is loaded via `@import "tailwindcss"` in `apps/webapp/src/app/globals.css`.
- `tw-animate-css` utilities are already imported in `globals.css`.
- Theme tokens are CSS variables in `:root` and `.dark`; reuse them before adding new ones.
- Use the `cn` helper from `@/lib/utils` to merge class names.
- Favor existing utility classes over custom CSS unless necessary.
- Component-level CSS (editor overrides) lives in `globals.css`.

## React and Next.js Patterns (webapp)
- App Router structure under `apps/webapp/src/app`.
- Use `layout.tsx` and `page.tsx` conventions for routes.
- API routes use `route.ts` with exported HTTP methods (`GET`, `POST`, etc.).
- Export `runtime = "nodejs"` in route handlers when node APIs are used.
- Prefer server components by default; mark client components explicitly if needed.
- Use `next/headers` for request headers in server handlers.

## Data Fetching (webapp)
- Keep data access in server components, layouts, or route handlers.
- Prefer server-side DB access through `@/db` and Drizzle.
- Use `headers()` and `cookies()` from Next.js in server-only code.
- Avoid client-side fetching unless the UI requires interactivity.

## API Route Patterns (webapp)
- Authenticate with `auth.api.getSession` and `headers()`.
- Validate request JSON and return structured errors.
- Use `NextResponse.json({ error: "..." }, { status: <code> })` for errors.
- Return explicit status codes for success (`200`, `201`, etc.).
- Use `try/catch` around network or DB operations.

## Auth and Public Env (webapp)
- Auth configuration lives in `apps/webapp/src/auth.ts` and uses `better-auth`.
- Prefer `auth.api.getSession` for authorization checks in routes.
- Public env exports are in `apps/webapp/src/public-env.ts` via `next-public-env`.
- Client-exposed vars use the `PUBLIC_` prefix; keep `.env.example` up to date.

## Collab Service Patterns (apps/collab)
- Hono routes live in `src/server.ts`.
- Use `c.json()` for responses and pass status codes explicitly.
- Websocket upgrade via `upgradeWebSocket` and `Bun.serve`.
- Log with `console.log`/`console.warn` for server diagnostics.
- Handle auth failures by returning `401` or closing websocket with `1008`.

## Database and Drizzle Usage
- Drizzle schema lives in `packages/kontexted-db/src`.
- Webapp imports schema via `@kontexted/db`.
- Use query helpers (`eq`, `desc`) from `drizzle-orm`.
- Prefer selecting explicit columns rather than `select()` on full tables.
- Use `returning({ ... })` to limit returned columns after insert.

## UI Components
- UI components are in `apps/webapp/src/components/ui`.
- They follow shadcn conventions (compound variants, `cn()` helper).
- Prefer `class-variance-authority` patterns when extending components.
- Keep component exports named and consistent with file names.

## Naming Conventions
- Files are kebab-case (e.g., `note-editor.tsx`).
- React components are PascalCase exports.
- Utility functions use lowerCamelCase.
- Route segments follow Next.js conventions (bracket params for dynamic routes).

## Error Handling
- Validate inputs early and return clear error messages.
- Use `try/catch` for external calls (DB, auth, network).
- Avoid throwing raw errors from API handlers; return JSON responses instead.
- Log unexpected errors with context (`console.warn` or `console.error`).

## Logging and Diagnostics
- Use `console.warn` for recoverable server failures.
- Use `console.error` for unexpected crashes or invariants.
- Use `console.log` sparingly for lifecycle events (collab server).
- Avoid logging secrets, tokens, or full request payloads.

## Performance and Safety
- Avoid unnecessary client components; prefer server components in webapp.
- Be careful with `crypto.randomUUID()` usage in server routes.
- Keep side effects in server handlers; avoid them in shared utilities.

## Cursor/Copilot Rules
- No `.cursor/rules`, `.cursorrules`, or `.github/copilot-instructions.md` files were found.
- If rules are added later, include their guidance here.

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:
1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes
