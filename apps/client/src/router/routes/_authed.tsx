/**
 * Authenticated route layout
 *
 * Acts as an auth gate for all protected routes under this path.
 * Checks session on mount and redirects to /login if not authenticated.
 */

import { createFileRoute, useNavigate, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { sessionQueryOptions } from "@/features/auth/queries";

export const Route = createFileRoute('/_authed')({
  component: AuthedComponent,
});

function AuthedComponent() {
  const navigate = useNavigate();

  const { data: session, isLoading: isChecking, error } = useQuery(sessionQueryOptions);

  useEffect(() => {
    // Redirect to login when not checking, no session, and no genuine error
    // (null session indicates unauthenticated state, not a failure)
    if (!isChecking && !session && !error) {
      navigate({ to: '/login', replace: true });
    }
  }, [session, isChecking, error, navigate]);

  if (isChecking) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-muted-foreground">Checking session...</div>
      </div>
    );
  }

  // For genuine errors (network/server failures), show recoverable error state
  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-muted-foreground">Failed to load session. Please refresh the page.</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return <Outlet />;
}
