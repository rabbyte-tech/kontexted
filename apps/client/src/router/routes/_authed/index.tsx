/**
 * Index route under _authed
 *
 * Redirects authenticated users from "/" to "/workspaces"
 * (parity with legacy react-router App.tsx behavior).
 */

import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute('/_authed/')({
  component: IndexComponent,
});

function IndexComponent() {
  return <Navigate to="/workspaces" replace />;
}
