import type { Workspace, WorkspaceTree } from "@/types"
import { apiClient } from "@/lib/api-client"
import { workspaceQueryKeys } from "@/lib/query/query-keys"

/**
 * Unauthorized error class for 401 responses
 * Allows routes to detect auth failures and redirect to login
 */
export class UnauthorizedError extends Error {
  readonly name = "UnauthorizedError"
  constructor(message = "Unauthorized - session may have expired") {
    super(message)
  }
}

/**
 * Type guard to check if an error is an UnauthorizedError
 */
export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return error instanceof UnauthorizedError
}

/**
 * Query options for fetching all workspaces
 */
export const workspacesQueryOptions = {
  queryKey: workspaceQueryKeys.list(),
  queryFn: async (): Promise<Workspace[]> => {
    const response = await apiClient.listWorkspaces()
    if (response.status === 401) {
      throw new UnauthorizedError()
    }
    if (response.status !== 200 || !response.data) {
      throw new Error(response.error || "Failed to load workspaces")
    }
    return response.data
  },
}

/**
 * Query option factory for fetching a workspace by slug
 */
export function workspaceQueryOptions(slug: string) {
  return {
    queryKey: workspaceQueryKeys.detail(slug),
    queryFn: async (): Promise<Workspace> => {
      const response = await apiClient.getWorkspace(slug)
      if (response.status === 401) {
        throw new UnauthorizedError()
      }
      if (response.status !== 200 || !response.data) {
        throw new Error(response.error || "Failed to load workspace")
      }
      return response.data
    },
  }
}

/**
 * Query option factory for fetching a workspace tree by slug
 */
export function workspaceTreeQueryOptions(slug: string) {
  return {
    queryKey: workspaceQueryKeys.tree(slug),
    queryFn: async (): Promise<WorkspaceTree> => {
      const response = await apiClient.getWorkspaceTree(slug)
      if (response.status === 401) {
        throw new UnauthorizedError()
      }
      if (response.status !== 200 || !response.data) {
        throw new Error(response.error || "Failed to load workspace tree")
      }
      return response.data
    },
  }
}
