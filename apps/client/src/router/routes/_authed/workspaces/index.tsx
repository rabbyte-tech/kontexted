/**
 * Workspace list route
 *
 * Loads all workspaces and navigates to the first workspace if available.
 * If no workspaces exist, shows the CreateWorkspaceCard.
 */

import { useEffect } from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import CreateWorkspaceCard from "@/components/folders/create-workspace-card";
import { workspacesQueryOptions, isUnauthorizedError } from "@/features/workspaces/queries";
import type { Workspace } from "@/types";
import type { RouterContext } from "@/router/index";

export const Route = createFileRoute('/_authed/workspaces/')({
  component: WorkspaceListComponent,
  loader: async ({ context }) => {
    const { queryClient } = context as RouterContext;
    try {
      await queryClient.ensureQueryData(workspacesQueryOptions);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw redirect({ to: '/login', replace: true });
      }
      // For other errors, don't throw - let component's useQuery handle it
    }
  },
});

function WorkspaceListComponent() {
  const navigate = useNavigate();

  const { data: workspaces, isLoading, error } = useQuery(workspacesQueryOptions);

  useEffect(() => {
    if (!isLoading && workspaces && workspaces.length > 0) {
      const firstWorkspace = workspaces[0] as Workspace;
      navigate({ to: '/workspaces/$workspaceSlug', params: { workspaceSlug: firstWorkspace.slug }, search: { labels: undefined }, replace: true });
    }
  }, [workspaces, isLoading, navigate]);

  // Redirect to login if unauthorized
  useEffect(() => {
    if (error && isUnauthorizedError(error)) {
      navigate({ to: '/login', replace: true });
    }
  }, [error, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-muted-foreground">Loading workspaces...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center p-8">
        <div className="w-full max-w-md rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <div className="text-destructive font-medium">Failed to load workspaces. Please try again.</div>
        </div>
      </div>
    );
  }

  // If there are no workspaces, show CreateWorkspaceCard
  if (workspaces && workspaces.length === 0) {
    return <CreateWorkspaceCard />;
  }

  // If workspaces exist, useEffect will navigate away
  return null;
}
