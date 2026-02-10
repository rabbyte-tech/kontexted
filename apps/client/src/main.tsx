/**
 * Main entry point for the Kontexted client
 *
 * Runtime cutover to TanStack Router (Step 03)
 * - Replaces BrowserRouter + App with TanStack RouterProvider
 * - Keeps QueryClientProvider at app root
 */

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { router } from "./router"
import { queryClient } from "./lib/query/query-client"
import "./index.css"

/**
 * Render the app
 */
function render() {
  const rootElement = document.getElementById("root")

  if (!rootElement) {
    throw new Error("Root element not found")
  }

  const root = createRoot(rootElement)

  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>
  )
}

// Start the app
render()
