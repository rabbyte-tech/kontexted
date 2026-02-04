# Kontexted Client Package

React client for Kontexted with TanStack Router, React Query, and Zustand state management.

## Architecture Overview

This client uses a modern architecture with:
- **TanStack Router** - Type-safe routing with file-based routes
- **React Query** - Server state management and caching
- **Zustand** - UI/transient state management
- **SSE** - Real-time workspace updates

## Directory Structure

```
apps/client/
├── src/
│   ├── components/      # React components
│   │   ├── auth/          # Authentication components
│   │   ├── editor/        # Note editor (CodeMirror + Y.js)
│   │   ├── folders/       # Folder tree and workspace shell
│   │   ├── history/       # Note history view
│   │   └── ui/            # Shadcn UI components
│   ├── features/         # Feature-based modules
│   │   ├── auth/          # Auth queries (session)
│   │   ├── workspaces/    # Workspace queries, mutations, SSE
│   │   └── notes/         # Note queries, mutations
│   ├── lib/              # Utilities and helpers
│   │   ├── query/         # React Query client configuration
│   │   ├── api-client.ts  # API client implementation
│   │   └── utils.ts       # Utility functions
│   ├── router/           # TanStack Router configuration
│   │   ├── routes/        # Route definitions (8 files)
│   │   └── index.tsx      # Router instance and context
│   ├── stores/           # Zustand stores
│   │   └── ui-store.ts    # UI state (transient only)
│   ├── hooks/            # Custom React hooks
│   ├── main.tsx          # Entry point
│   ├── public-env.ts     # Public environment variables
│   └── index.css         # Global styles (Tailwind v4)
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## Route Structure

TanStack Router uses file-based routing with the following routes:

| File | Route | Purpose |
|------|-------|---------|
| `__root.tsx` | `/` | Root layout (providers, global styles) |
| `login.tsx` | `/login` | Login page |
| `_authed.tsx` | *(pathless)* | Authenticated layout wrapper (not part of public URL) |
| `_authed/index.tsx` | `/` | Redirect to `/workspaces` for authenticated users |
| `workspaces/index.tsx` | `/workspaces` | Workspace list, auto-navigate to first workspace |
| `workspaces/$workspaceSlug.tsx` | `/workspaces/:slug` | Workspace detail with folder tree (persistent layout) |
| `workspaces/$workspaceSlug.notes.$noteId.tsx` | `/workspaces/:slug/notes/:id` | Note editor view |
| `workspaces/$workspaceSlug.notes.$noteId.history.tsx` | `/workspaces/:slug/notes/:id/history` | Note history view |

**Key Features:**
- Path parameters use `$` prefix (e.g., `$workspaceSlug`, `$noteId`)
- Layout routes (`_authed`, `$workspaceSlug`) remain mounted during child navigation
- Route loaders prefetch data via React Query before component render
- Fail-closed auth: loaders redirect to `/login` on unauthorized errors

## Data Flow

### Server State (React Query)

**Read Operations** (in `features/*/queries.ts`):
- `sessionQueryOptions` - Current user session (auth)
- `workspacesQueryOptions` - List of all workspaces
- `workspaceQueryOptions(slug)` - Workspace by slug
- `workspaceTreeQueryOptions(slug)` - Folder tree for workspace
- `noteQueryOptions(slug, noteId)` - Note detail and content
- `noteHistoryQueryOptions(slug, noteId)` - Note revision history
- `collabTokenQueryOptions(slug, noteId)` - Collab token for WebSocket

**Write Operations** (in `features/*/mutations.ts`):
- `useCreateWorkspace` - Create new workspace
- `useUploadWorkspaceEntries` - Bulk markdown upload
- `useCreateFolder`, `useCreateNote` - Create folder/note
- `useUpdateFolder`, `useUpdateNote` - Update folder/note metadata
- `useDeleteFolder`, `useDeleteNote` - Delete folder/note
- `useMoveFolder`, `useMoveNote` - Move folder/note to new parent
- `useUpdateNoteContent` - Manual save (note content)

**Cache Invalidation Strategy:**
- Mutations invalidate minimal query keys in `onSuccess` callbacks
- Folder/note changes → invalidate `workspaceQueryKeys.tree(slug)`
- Note updates/deletes → also invalidate `noteQueryKeys.detail(slug, noteId)`
- Workspace creation → invalidate `workspaceQueryKeys.list()`
- Route loaders use `queryClient.ensureQueryData()` to prefetch data

### Real-Time Updates (SSE)

**SSE Integration** (`features/workspaces/sse.ts`):
- `useWorkspaceSSE` hook subscribes to workspace events
- Events trigger query invalidation (not direct state updates):
  - `note.created/updated/deleted/moved` → invalidate tree and note queries
  - `folder.created/updated/deleted/moved` → invalidate tree queries
- SSE subscription mounted in workspace layout route (`$workspaceSlug.tsx`)
- EventSource cleanup on unmount

### UI State (Zustand)

**UI Store** (`stores/ui-store.ts`):
- `labelMode` - Tree display mode ("display" | "name") - global preference
- `expandedFolderIdsByWorkspace` - Expanded folders per workspace (workspace-scoped)
- `createWorkspaceModalOpen` - Create workspace modal state
- `activeDialog` - Active dialog mode (create-folder, rename-note, etc.)
- `dialogDraft` - Draft input values for dialogs

**Constraints:**
- NO server entities in store (transient UI state only)
- Workspace-specific state keyed by workspace slug
- No persistence (transient only)
- State persists across route navigation within same workspace

## Authentication

**Auth Flow:**
- KeycloakSignIn component handles OAuth flow
- Session managed via `sessionQueryOptions` with stable key `["auth", "session"]`
- Unauthenticated users redirected to `/login` from `_authed` layout
- `isUnauthorizedError` class detects 401 responses
- Auth state shared across all components via React Query cache

## Development

```bash
# Install dependencies (from repo root)
pnpm install

# Start development server
pnpm --filter @kontexted/client dev

# Build for production
pnpm --filter @kontexted/client build

# Preview production build
pnpm --filter @kontexted/client preview

# Run TypeScript compiler (check for errors)
pnpm --filter @kontexted/client exec tsc --noEmit
```

## Build Commands

```bash
# Type check
pnpm --filter @kontexted/client exec tsc --noEmit

# Build (type check + Vite build)
pnpm --filter @kontexted/client build

# Build output artifacts
dist/index.html                           # HTML entry
dist/assets/index-*.css                  # Compiled CSS (Tailwind v4)
dist/assets/index-*.js                    # Application code
dist/assets/*-vendor.js                   # Split vendor chunks
```

## Technology Stack

- **Build**: Vite 6 (fast HMR, optimized builds)
- **Routing**: TanStack Router 1.158 (type-safe, file-based)
- **State Management**: React Query 5.64 (server), Zustand 5.0 (UI)
- **Styling**: Tailwind CSS v4, Radix UI primitives
- **Editor**: CodeMirror 6 (language, autocomplete, commands, state, view)
- **Collaboration**: Y.js 13.6 + y-websocket 3.0 + y-codemirror.next 0.3
- **Real-time**: EventSource (SSE) for workspace events
- **Type Safety**: TypeScript 5 (strict mode)
- **Node**: >=24.13.0

## Key Architectural Decisions

### Route-level Data Ownership
- Route loaders prefetch critical data via `queryClient.ensureQueryData()`
- Components use `useQuery` with same options for reactivity
- Layout routes own data for child routes (workspace detail, tree)
- Single source of truth: React Query cache

### State Ownership Boundaries
- **Server state**: React Query (auth session, workspaces, notes, folders)
- **UI/transient state**: Zustand (dialogs, modals, expanded folders, preferences)
- **Local component state**: Drag-and-drop, editor state (resets on remount)

### Mutation Flow
```
User Action → Mutation Hook (use*) → apiClient call → onSuccess → query invalidation
```
- Mutations trigger query invalidation, not direct component updates
- Components automatically re-render when invalidated queries refetch
- Cross-component data flow: Mutation → Invalidation → Query Refetch → Prop Update

### Navigation Behavior
- Workspace layout (`$workspaceSlug.tsx`) remains mounted for note navigation
- Folder tree persists state (expanded folders, label mode) within workspace
- Note editor remounts on note navigation (intentional: fresh editor state)
- Navigating to different workspace switches to that workspace's UI state

## Manual Save Mode

When `PUBLIC_COLLAB_URL` is not set:
- Editor uses manual save mode
- Save button appears in editor
- `useUpdateNoteContent` mutation saves note content
- No WebSocket collaboration features

## Migration Notes

This client was migrated from React Router to TanStack Router in Step 03 of the refactor.

**Key Changes:**
- Route syntax: `:slug` → `$slug`
- Route structure: Flat routes → Nested file-based routes
- Data fetching: Component useEffect → Route loaders + useQuery
- Navigation: `useNavigate` from TanStack Router (not react-router-dom)
- Auth: Route loaders redirect on unauthorized errors (fail-closed)

**Legacy Removals (Step 03-06):**
- ✅ `App.tsx` removed (router now in main.tsx + router/index.tsx)
- ✅ `routes/` directory removed (legacy files deleted)
- ✅ Direct `apiClient.get*` calls replaced with React Query
- ✅ Direct `apiClient.create/update/delete/move*` calls replaced with mutation hooks
- ✅ Local component state replaced with Zustand store where appropriate

## Troubleshooting

**Build fails with TypeScript errors:**
- Ensure all imports use correct paths (`@/` alias maps to `src/`)
- Check for missing route parameters in loaders/components
- Verify query options export correctly from feature modules

**Data not refreshing after mutation:**
- Check mutation `onSuccess` invalidates correct query keys
- Verify query key factory functions use stable parameters
- Ensure component subscribes to correct query

**UI state lost on navigation:**
- Check if state is in Zustand store (should persist)
- Verify workspace key is correct for workspace-scoped state
- Remember: local component state resets on unmount (intentional)

**SSE not receiving updates:**
- Verify `useWorkspaceSSE` is called in workspace layout route
- Check workspaceSlug parameter is valid
- Confirm SSE endpoint returns correct event format
