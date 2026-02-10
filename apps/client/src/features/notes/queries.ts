import type { Note, NoteHistoryResponse, CollabToken } from "@/types"
import { apiClient } from "@/lib/api-client"
import { noteQueryKeys } from "@/lib/query/query-keys"

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
 * Query option factory for fetching a note by workspace slug and note public ID
 */
export function noteQueryOptions(workspaceSlug: string, noteId: string) {
  return {
    queryKey: noteQueryKeys.detail(workspaceSlug, noteId),
    queryFn: async (): Promise<Note> => {
      const response = await apiClient.getNote(workspaceSlug, noteId)
      if (response.status === 401) {
        throw new UnauthorizedError()
      }
      if (response.status !== 200 || !response.data) {
        throw new Error(response.error || "Failed to load note")
      }
      return response.data
    },
  }
}

/**
 * Query option factory for fetching note revision history
 */
export function noteHistoryQueryOptions(workspaceSlug: string, noteId: string) {
  return {
    queryKey: noteQueryKeys.history(workspaceSlug, noteId),
    queryFn: async (): Promise<NoteHistoryResponse> => {
      const response = await apiClient.getNoteHistory(workspaceSlug, noteId)
      if (response.status === 401) {
        throw new UnauthorizedError()
      }
      if (response.status !== 200 || !response.data) {
        throw new Error(response.error || "Failed to load note history")
      }
      return response.data
    },
  }
}

/**
 * Query option factory for fetching a collab token for a note
 */
export function collabTokenQueryOptions(workspaceSlug: string, noteId: string) {
  return {
    queryKey: noteQueryKeys.collabToken(workspaceSlug, noteId),
    queryFn: async (): Promise<CollabToken> => {
      const response = await apiClient.getCollabToken(workspaceSlug, noteId)
      if (response.status === 401) {
        throw new UnauthorizedError()
      }
      if (response.status !== 200 || !response.data) {
        throw new Error(response.error || "Failed to get collab token")
      }
      return response.data
    },
  }
}
