/**
 * TanStack Router instance and configuration
 *
 * This file exports the configured router instance, which is now the primary routing
 * solution after migrating from react-router-dom to TanStack Router.
 */

import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "../lib/query/query-client";

/**
 * Router context type
 * Provides the query client to loaders for data prefetching
 */
export type RouterContext = {
  queryClient: typeof queryClient
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
  interface RouteContext {
    queryClient: typeof queryClient
  }
}

/**
 * Create and export the router instance
 */
export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
});
