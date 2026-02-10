import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import type { Variables } from "@/routes/types";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Find the static files root directory.
 *
 * For production builds only: Resolves to apps/server/dist/public
 * This directory must exist for the server to function properly.
 */
function findStaticRoot(): string {
  return join(__dirname, "public");
}

export function setupStatic(app: Hono<{ Variables: Variables }>) {
  // Resolve static root once for all routes
  const staticRoot = findStaticRoot();

  // Serve static assets from dist/public directory
  app.use("/assets/*", serveStatic({ root: staticRoot }));

  // Serve logo and other root files
  app.use("/logo.png", serveStatic({ path: join(staticRoot, "logo.png") }));

  // Serve index.html for all non-API routes (SPA routing)
  app.get("*", (c) => {
    const path = c.req.path;
    if (path.startsWith("/api/") ||
        path.startsWith("/.well-known/") ||
        path === "/health") {
      return c.notFound();
    }

    try {
      const indexPath = join(staticRoot, "index.html");
      const html = readFileSync(indexPath, "utf-8");
      return c.html(html);
    } catch {
      return c.text(
        "Client build not found. Run: pnpm build:full to build the client and server together.",
        500
      );
    }
  });
}
