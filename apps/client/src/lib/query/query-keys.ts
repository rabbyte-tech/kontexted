/**
 * Central query key factory for React Query
 *
 * Consolidates all query keys for auth, workspaces, and notes into a single
 * stable location. All query options and mutations should import keys from this
 * factory to ensure consistency and enable targeted invalidation.
 *
 * Key naming convention:
 * - Entity scope (auth, workspaces, notes) at the top level
 * - Nested arrays for hierarchical data (details, trees, etc.)
 * - Factory functions for parameterized keys (slug, noteId)
 * - All keys use `as const` for type safety and readonly tuples
 */

/**
 * Auth query keys
 */
export const authQueryKeys = {
  session: ["auth", "session"] as const,
} as const

/**
 * Workspace query keys
 *
 * Hierarchy: workspaces → [all, list, detail, tree] → optional slug
 */
export const workspaceQueryKeys = {
  all: ["workspaces"] as const,
  lists: () => [...workspaceQueryKeys.all, "list"] as const,
  list: () => [...workspaceQueryKeys.lists()] as const,
  details: () => [...workspaceQueryKeys.all, "detail"] as const,
  detail: (slug: string) => [...workspaceQueryKeys.details(), slug] as const,
  trees: () => [...workspaceQueryKeys.all, "tree"] as const,
  tree: (slug: string) => [...workspaceQueryKeys.trees(), slug] as const,
} as const

/**
 * Note query keys
 *
 * Hierarchy: notes → [detail, history, collabToken] → workspaceSlug, noteId
 */
export const noteQueryKeys = {
  all: ["notes"] as const,
  details: () => [...noteQueryKeys.all, "detail"] as const,
  detail: (workspaceSlug: string, noteId: string) =>
    [...noteQueryKeys.details(), workspaceSlug, noteId] as const,
  histories: () => [...noteQueryKeys.all, "history"] as const,
  history: (workspaceSlug: string, noteId: string) =>
    [...noteQueryKeys.histories(), workspaceSlug, noteId] as const,
  collabTokens: () => [...noteQueryKeys.all, "collabToken"] as const,
  collabToken: (workspaceSlug: string, noteId: string) =>
    [...noteQueryKeys.collabTokens(), workspaceSlug, noteId] as const,
} as const

/**
 * Server query keys
 */
export const serverQueryKeys = {
  all: ["server"] as const,
  capabilities: () => [...serverQueryKeys.all, "capabilities"] as const,
} as const

/**
 * Type helpers for query keys (optional, for advanced use cases)
 */
export type AuthQueryKey = typeof authQueryKeys.session
export type ServerQueryKey =
  | typeof serverQueryKeys.capabilities
export type WorkspaceQueryKey =
  | typeof workspaceQueryKeys.all
  | typeof workspaceQueryKeys.list
  | typeof workspaceQueryKeys.lists
  | typeof workspaceQueryKeys.details
  | typeof workspaceQueryKeys.trees
  | ReturnType<typeof workspaceQueryKeys.detail>
  | ReturnType<typeof workspaceQueryKeys.tree>
export type NoteQueryKey =
  | typeof noteQueryKeys.all
  | typeof noteQueryKeys.details
  | typeof noteQueryKeys.histories
  | typeof noteQueryKeys.collabTokens
  | ReturnType<typeof noteQueryKeys.detail>
  | ReturnType<typeof noteQueryKeys.history>
  | ReturnType<typeof noteQueryKeys.collabToken>
