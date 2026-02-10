import type { ApiResponse, Session } from "@/types"
import { apiClient } from "@/lib/api-client"
import { authQueryKeys } from "@/lib/query/query-keys"

/**
 * Query options for fetching the current session
 *
 * Uses a single stable query key to avoid duplicate session requests
 * across route transitions. Returns null for unauthenticated state and
 * throws only on genuine network/server failures.
 */
export const sessionQueryOptions = {
  queryKey: authQueryKeys.session,
  queryFn: async (): Promise<Session | null> => {
    const response: ApiResponse<Session> = await apiClient.getSession()

    // Network error (status 0) - this is a genuine failure
    if (response.status === 0) {
      throw new Error("Network error: failed to fetch session")
    }

    // Unauthenticated responses - return null
    if (response.status === 401 || response.status === 403) {
      return null
    }

    // Non-2xx responses (other than 401/403) - genuine failure
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Server error: ${response.status}`)
    }

    // Successful 2xx response with session data
    if (response.data) {
      return response.data
    }

    // Successful 2xx response without session payload - treat as unauthenticated
    return null
  },
}
