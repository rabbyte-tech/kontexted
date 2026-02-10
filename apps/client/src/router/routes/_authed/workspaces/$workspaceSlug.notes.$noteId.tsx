/**
 * Note detail route
 *
 * Layout route for note detail views (index, history, etc.)
 * Prefetches note data for all child routes.
 *
 * Ported from routes/NoteRoute.tsx to TanStack Router
 */

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { noteQueryOptions, isUnauthorizedError } from "@/features/notes/queries";
import type { RouterContext } from "@/router/index";

function NoteLayout() {
  return <Outlet />;
}

export const Route = createFileRoute('/_authed/workspaces/$workspaceSlug/notes/$noteId')({
  component: NoteLayout,
  loader: async ({ params, context }) => {
    const { workspaceSlug, noteId } = params;
    const { queryClient } = context as RouterContext;

    if (!workspaceSlug || !noteId) {
      return;
    }

    try {
      // Prefetch note data for all child routes
      await queryClient.ensureQueryData(noteQueryOptions(workspaceSlug, noteId));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw redirect({ to: '/login', replace: true });
      }
      // For other errors, don't throw - let component's useQuery handle it
    }
  },
});
