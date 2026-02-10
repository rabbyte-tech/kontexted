import type { ServerCapabilities } from "@/types"
import { apiClient } from "@/lib/api-client"
import { serverQueryKeys } from "@/lib/query/query-keys"

/**
 * Query option factory for fetching server capabilities
 */
export function serverCapabilitiesQueryOptions() {
  return {
    queryKey: serverQueryKeys.capabilities(),
    queryFn: async (): Promise<ServerCapabilities> => {
      const response = await apiClient.getServerCapabilities()
      if (response.status !== 200 || !response.data) {
        throw new Error(response.error || "Failed to fetch server capabilities")
      }
      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  }
}
