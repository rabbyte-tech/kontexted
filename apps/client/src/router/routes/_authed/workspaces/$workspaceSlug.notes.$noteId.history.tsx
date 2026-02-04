/**
 * Note history route
 *
 * Displays the version history for a specific note.
 *
 * Ported from routes/NoteHistoryRoute.tsx to TanStack Router
 */

import { useEffect } from "react";
import { createFileRoute, Navigate, useParams, useNavigate, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import NoteHistory from "@/components/history/note-history";
import { noteQueryOptions, noteHistoryQueryOptions, isUnauthorizedError } from "@/features/notes/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { RouterContext } from "@/router/index";

function NoteHistoryComponent() {
  const { workspaceSlug, noteId } = useParams({ from: "/_authed/workspaces/$workspaceSlug/notes/$noteId/history" });
  const navigate = useNavigate();

  // Fetch note data using React Query (shares cache with note detail route)
  const noteQuery = useQuery({
    ...noteQueryOptions(workspaceSlug || "", noteId || ""),
    enabled: !!workspaceSlug && !!noteId,
  });

  // Fetch note history using React Query
  const historyQuery = useQuery({
    ...noteHistoryQueryOptions(workspaceSlug || "", noteId || ""),
    enabled: !!workspaceSlug && !!noteId,
  });

  // Handle unauthorized errors with safe navigation
  useEffect(() => {
    const hasUnauthorizedError =
      (noteQuery.error && isUnauthorizedError(noteQuery.error)) ||
      (historyQuery.error && isUnauthorizedError(historyQuery.error));
    if (hasUnauthorizedError) {
      navigate({ to: "/login", replace: true });
    }
  }, [noteQuery.error, historyQuery.error, navigate]);

  const isLoading = noteQuery.isLoading || historyQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex h-full min-h-svh items-center justify-center">
        <div className="w-full max-w-2xl space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const noteError = noteQuery.error && !isUnauthorizedError(noteQuery.error);
  const historyError = historyQuery.error && !isUnauthorizedError(historyQuery.error);
  const error = noteError || historyError;

  if (error) {
    const errorMessage =
      noteError && historyError
        ? `${noteQuery.error?.message}; ${historyQuery.error?.message}`
        : (noteQuery.error?.message || historyQuery.error?.message || "Failed to load note");

    return (
      <div className="flex h-full min-h-svh items-center justify-center p-8">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Prevent workspace fallback for unauthorized errors; let the effect redirect to /login
  const hasUnauthorizedError =
    (noteQuery.error && isUnauthorizedError(noteQuery.error)) ||
    (historyQuery.error && isUnauthorizedError(historyQuery.error));
  if (hasUnauthorizedError) {
    return null;
  }

  if (!noteQuery.data) {
    return <Navigate to="/workspaces/$workspaceSlug" params={{ workspaceSlug: workspaceSlug || "" }} search={{ labels: undefined }} replace />;
  }

  const note = noteQuery.data;
  const revisionHistory = historyQuery.data?.revisions ?? [];

  return (
    <NoteHistory
      workspaceId={note.workspaceId}
      workspaceSlug={workspaceSlug || ""}
      noteId={note.id}
      notePublicId={note.publicId}
      title={note.title}
      name={note.name}
      revisionHistory={revisionHistory}
    />
  );
}

export const Route = createFileRoute('/_authed/workspaces/$workspaceSlug/notes/$noteId/history')({
  component: NoteHistoryComponent,
  loader: async ({ params, context }) => {
    const { workspaceSlug, noteId } = params;
    const { queryClient } = context as RouterContext;

    if (!workspaceSlug || !noteId) {
      return;
    }

    try {
      // Prefetch note data (shares cache with note detail route)
      await queryClient.ensureQueryData(noteQueryOptions(workspaceSlug, noteId));

      // Prefetch note history
      await queryClient.ensureQueryData(noteHistoryQueryOptions(workspaceSlug, noteId));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw redirect({ to: '/login', replace: true });
      }
      // For other errors, don't throw - let component's useQuery handle it
    }
  },
});
