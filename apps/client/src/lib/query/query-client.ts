import { QueryClient } from "@tanstack/react-query"

/**
 * Singleton QueryClient instance
 *
 * Configuration matches legacy behavior from main.tsx:
 * - Queries: staleTime 5 minutes, retry once, no window focus refetch
 * - Mutations: retry once
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
    mutations: {
      retry: 1,
    },
  },
})
