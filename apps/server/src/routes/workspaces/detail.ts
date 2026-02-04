import { Hono } from "hono";
import { parseSlug } from "@/lib/params";
import { resolveWorkspaceId } from "@/lib/resolvers";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/routes/middleware/require-auth";
import type { Variables } from "@/routes/types";

const app = new Hono<{ Variables: Variables }>();

// GET /api/workspaces/:workspaceSlug - Get workspace details by slug
app.get("/", requireAuth, async (c) => {
  const workspaceSlug = c.req.param("workspaceSlug");
  const validatedSlug = parseSlug(workspaceSlug);

  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const rows = await c.get("db")
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceIdValue))
    .limit(1);

  if (!rows[0]) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  return c.json(rows[0], 200);
});

export { app };
