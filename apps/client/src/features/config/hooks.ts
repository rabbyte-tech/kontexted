import { useQuery } from "@tanstack/react-query"
import { serverCapabilitiesQueryOptions } from "./queries"

/**
 * Hook to fetch and use server capabilities
 */
export function useServerCapabilities() {
  return useQuery(serverCapabilitiesQueryOptions())
}
