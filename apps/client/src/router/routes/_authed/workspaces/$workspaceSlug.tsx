/**
 * Workspace detail route
 *
 * Displays a specific workspace with its folder tree and note editor area.
 * This route remains mounted when navigating to child note routes, providing
 * a persistent workspace shell.
 *
 * Ported from routes/WorkspaceView.tsx to TanStack Router
 */

import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate, useParams, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import WorkspaceShell from "@/components/folders/workspace-shell";
import { workspacesQueryOptions, workspaceQueryOptions, workspaceTreeQueryOptions, isUnauthorizedError } from "@/features/workspaces/queries";
import { useWorkspaceSSE } from "@/features/workspaces/sse";
import { Skeleton } from "@/components/ui/skeleton";
import type { RouterContext } from "@/router/index";

type WorkspaceSummary = {
  id: number;
  slug: string;
  name: string;
};

function WorkspaceComponent() {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams({ from: "/_authed/workspaces/$workspaceSlug" });

  // Get workspace data
  const { data: workspace, isLoading: isLoadingWorkspace, error: workspaceError } = useQuery({
    ...workspaceQueryOptions(workspaceSlug || ""),
    enabled: !!workspaceSlug,
  });

  // Get tree data
  const { data: tree, isLoading: isLoadingTree, error: treeError } = useQuery({
    ...workspaceTreeQueryOptions(workspaceSlug || ""),
    enabled: !!workspaceSlug,
  });

  // Get all workspaces list
  const { data: workspaces } = useQuery(workspacesQueryOptions);

  // Subscribe to workspace SSE events for real-time updates
  // This triggers query invalidation when workspace events occur
  useWorkspaceSSE(workspaceSlug || null);

  useEffect(() => {
    if (!workspaceSlug) {
      navigate({ to: "/workspaces", replace: true });
      return;
    }

    // If workspace not found, show error (will be rendered below)
    if (!isLoadingWorkspace && !workspace && !workspaceError) {
      return;
    }
  }, [workspaceSlug, navigate, isLoadingWorkspace, workspace, workspaceError]);

  // Redirect to login if unauthorized (from either workspace or tree query)
  useEffect(() => {
    if ((workspaceError && isUnauthorizedError(workspaceError)) ||
        (treeError && isUnauthorizedError(treeError))) {
      navigate({ to: '/login', replace: true });
    }
  }, [workspaceError, treeError, navigate]);

  const isLoading = isLoadingWorkspace || isLoadingTree;
  const error = (workspaceError as Error)?.message || (treeError as Error)?.message || null;

  if (isLoading) {
    return (
      <div className="flex h-svh">
        <div className="w-80 border-r border-border p-4 space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">Loading workspace...</div>
        </div>
      </div>
    );
  }

  if (error || !workspace || !tree) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="text-destructive">{error || "Failed to load workspace"}</div>
      </div>
    );
  }

  const workspaceSummaries: WorkspaceSummary[] = (workspaces || []).map((w) => ({
    id: w.id,
    slug: w.slug,
    name: w.name,
  }));

  return (
    <WorkspaceShell
      workspaceSlug={workspaceSlug || null}
      workspaceName={workspace.name}
      workspaces={workspaceSummaries}
      initialTree={tree}
    >
      <Outlet />
    </WorkspaceShell>
  );
}

export const Route = createFileRoute('/_authed/workspaces/$workspaceSlug')({
  component: WorkspaceComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    labels: typeof search.labels === "string" ? search.labels : undefined,
  }),
  loader: async ({ params, context }) => {
    const { workspaceSlug } = params;
    const { queryClient } = context as RouterContext;

    if (!workspaceSlug) {
      return;
    }

    try {
      // Prefetch workspace list for workspace switcher
      await queryClient.ensureQueryData(workspacesQueryOptions);

      // Prefetch workspace by slug
      await queryClient.ensureQueryData(workspaceQueryOptions(workspaceSlug));

      // Prefetch workspace tree
      await queryClient.ensureQueryData(workspaceTreeQueryOptions(workspaceSlug));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw redirect({ to: '/login', replace: true });
      }
      // For other errors, don't throw - let component's useQuery handle it
    }
  },
});
