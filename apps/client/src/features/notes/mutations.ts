import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { UpdateNoteContentResponse } from "@/types"
import { apiClient } from "@/lib/api-client"
import { workspaceQueryKeys, noteQueryKeys } from "@/lib/query/query-keys"

/**
 * Mutation hook for creating a folder
 *
 * Invalidates workspace tree after successful creation
 */
export function useCreateFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      workspaceSlug: string
      displayName: string
      name: string
      parentId?: string | null
    }) => {
      const response = await apiClient.createFolder(
        params.workspaceSlug,
        params.displayName,
        params.name,
        params.parentId ?? undefined
      )
      if (response.error) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(params.workspaceSlug),
      })
    },
  })
}

/**
 * Mutation hook for creating a note
 *
 * Invalidates workspace tree after successful creation
 */
export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      workspaceSlug: string
      title: string
      name: string
      folderId?: string | null
    }) => {
      const response = await apiClient.createNote(
        params.workspaceSlug,
        params.title,
        params.name,
        params.folderId ?? undefined
      )
      if (response.error) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(params.workspaceSlug),
      })
    },
  })
}

/**
 * Mutation hook for updating a folder
 *
 * Invalidates workspace tree after successful update
 */
export function useUpdateFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      workspaceSlug: string
      folderPublicId: string
      displayName?: string
      name?: string
    }) => {
      const response = await apiClient.updateFolder(
        params.workspaceSlug,
        params.folderPublicId,
        params.displayName,
        params.name
      )
      if (response.error) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(params.workspaceSlug),
      })
    },
  })
}

/**
 * Mutation hook for updating a note
 *
 * Invalidates workspace tree after successful update
 */
export function useUpdateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      workspaceSlug: string
      notePublicId: string
      title?: string
      name?: string
    }) => {
      const response = await apiClient.updateNote(
        params.workspaceSlug,
        params.notePublicId,
        params.title,
        params.name
      )
      if (response.error) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(params.workspaceSlug),
      })
      // Also invalidate the note detail if it's loaded
      queryClient.invalidateQueries({
        queryKey: noteQueryKeys.detail(params.workspaceSlug, params.notePublicId),
      })
    },
  })
}

/**
 * Mutation hook for deleting a folder
 *
 * Invalidates workspace tree after successful deletion
 */
export function useDeleteFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      workspaceSlug: string
      folderPublicId: string
    }) => {
      const response = await apiClient.deleteFolder(
        params.workspaceSlug,
        params.folderPublicId
      )
      if (response.error) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(params.workspaceSlug),
      })
    },
  })
}

/**
 * Mutation hook for deleting a note
 *
 * Invalidates workspace tree after successful deletion
 */
export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      workspaceSlug: string
      notePublicId: string
    }) => {
      const response = await apiClient.deleteNote(
        params.workspaceSlug,
        params.notePublicId
      )
      if (response.error) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(params.workspaceSlug),
      })
      // Also invalidate the note detail if it's loaded
      queryClient.invalidateQueries({
        queryKey: noteQueryKeys.detail(params.workspaceSlug, params.notePublicId),
      })
    },
  })
}

/**
 * Mutation hook for moving a folder
 *
 * Invalidates workspace tree after successful move
 */
export function useMoveFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      workspaceSlug: string
      folderPublicId: string
      parentId: string | null
    }) => {
      const response = await apiClient.moveFolder(
        params.workspaceSlug,
        params.folderPublicId,
        params.parentId
      )
      if (response.error) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(params.workspaceSlug),
      })
    },
  })
}

/**
 * Mutation hook for moving a note
 *
 * Invalidates workspace tree after successful move
 */
export function useMoveNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      workspaceSlug: string
      notePublicId: string
      folderId: string | null
    }) => {
      const response = await apiClient.moveNote(
        params.workspaceSlug,
        params.notePublicId,
        params.folderId
      )
      if (response.error) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(params.workspaceSlug),
      })
    },
  })
}

/**
 * Mutation hook for updating note content (manual save mode)
 *
 * Invalidates the note detail after successful update
 */
export function useUpdateNoteContent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      workspaceSlug: string
      notePublicId: string
      content: string
      includeBlame?: boolean
    }): Promise<UpdateNoteContentResponse> => {
      const response = await apiClient.updateNoteContent(
        params.workspaceSlug,
        params.notePublicId,
        params.content,
        params.includeBlame
      )
      if (response.error) {
        throw new Error(response.error)
      }
      if (!response.data) {
        throw new Error("Failed to update note content")
      }
      return response.data
    },
    onSuccess: (_, params) => {
      // Invalidate the note detail to get the updated content
      queryClient.invalidateQueries({
        queryKey: noteQueryKeys.detail(params.workspaceSlug, params.notePublicId),
      })
    },
  })
}
