import { Hono } from "hono";
import { parseSlug } from "@/lib/params";
import { resolveWorkspaceId } from "@/lib/resolvers";
import { getWorkspaceTree } from "@/lib/workspace-tree";
import { requireAuth } from "@/routes/middleware/require-auth";
import type { Variables } from "@/routes/types";

const app = new Hono<{ Variables: Variables }>();

// GET /api/workspaces/:workspaceSlug/tree - Get workspace tree with folders and notes
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

  const tree = await getWorkspaceTree(workspaceIdValue);
  if (!tree) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  return c.json(tree, 200);
});

export { app };
