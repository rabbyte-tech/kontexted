/**
 * Note detail index route
 *
 * Displays a specific note within a workspace (not history view).
 *
 * This is the default view when navigating to `/workspaces/$workspaceSlug/notes/$noteId`
 */

import { useEffect } from "react";
import { createFileRoute, Navigate, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import NoteEditor from "@/components/editor/note-editor";
import { noteQueryOptions, isUnauthorizedError } from "@/features/notes/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

function NoteComponent() {
  const { workspaceSlug, noteId } = useParams({ from: "/_authed/workspaces/$workspaceSlug/notes/$noteId" });
  const navigate = useNavigate();

  // Fetch note data using React Query
  const noteQuery = useQuery({
    ...noteQueryOptions(workspaceSlug || "", noteId || ""),
    enabled: !!workspaceSlug && !!noteId,
  });

  // Handle unauthorized errors with safe navigation
  useEffect(() => {
    if (noteQuery.error && isUnauthorizedError(noteQuery.error)) {
      navigate({ to: "/login", replace: true });
    }
  }, [noteQuery.error, navigate]);

  if (noteQuery.isLoading) {
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

  if (noteQuery.error && !isUnauthorizedError(noteQuery.error)) {
    return (
      <div className="flex h-full min-h-svh items-center justify-center p-8">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{noteQuery.error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Prevent workspace fallback for unauthorized errors; let the effect redirect to /login
  if (noteQuery.error && isUnauthorizedError(noteQuery.error)) {
    return null;
  }

  if (!noteQuery.data) {
    return <Navigate to="/workspaces/$workspaceSlug" params={{ workspaceSlug: workspaceSlug || "" }} search={{ labels: undefined }} replace />;
  }

  const note = noteQuery.data;
  const initialBlame = note.blame ?? [];

  return (
    <NoteEditor
      workspaceId={note.workspaceId}
      workspaceSlug={workspaceSlug || ""}
      noteId={note.id}
      notePublicId={note.publicId}
      title={note.title}
      name={note.name}
      initialContent={note.content}
      initialUpdatedAt={String(note.updatedAt)}
      initialBlame={initialBlame}
    />
  );
}

export const Route = createFileRoute('/_authed/workspaces/$workspaceSlug/notes/$noteId/')({
  component: NoteComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === "code" || search.view === "split" || search.view === "preview" ? search.view : undefined,
  }),
});
