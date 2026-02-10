import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { UploadWorkspaceEntriesRequest } from "@/types"
import type { UploadWorkspaceEntriesResponse } from "@/types"
import { apiClient } from "@/lib/api-client"
import { workspaceQueryKeys } from "@/lib/query/query-keys"

/**
 * Mutation hook for creating a workspace
 *
 * Invalidates workspaces list after successful creation
 */
export function useCreateWorkspace() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string) => {
      const response = await apiClient.createWorkspace(name)
      if (response.error) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.list() })
    },
  })
}

/**
 * Mutation hook for uploading markdown entries to a workspace
 *
 * Invalidates workspace tree after successful upload
 */
export function useUploadWorkspaceEntries() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      workspaceSlug: string
      request: UploadWorkspaceEntriesRequest
    }): Promise<UploadWorkspaceEntriesResponse> => {
      const response = await apiClient.uploadWorkspaceEntries(
        params.workspaceSlug,
        params.request
      )
      if (response.error) {
        throw new Error(response.error)
      }
      if (!response.data) {
        throw new Error("Failed to upload workspace entries")
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
