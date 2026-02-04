/**
 * Root route for TanStack Router
 */

import { createRootRoute, Outlet } from "@tanstack/react-router";
import "../../index.css";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return <Outlet />;
}
