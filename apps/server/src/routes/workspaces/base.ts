import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { workspaces } from "@/db/schema";
import { toSlug } from "@/routes/workspaces/helpers";
import { requireAuth } from "@/routes/middleware/require-auth";
import type { Variables, CreateWorkspaceBody } from "@/routes/types";
import { isRecord } from "@/routes/types";

const baseApp = new Hono<{ Variables: Variables }>();

// GET /api/workspaces - List all workspaces
baseApp.get("/", requireAuth, async (c) => {
  const rows = await c.get("db").select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name }).from(workspaces).orderBy(desc(workspaces.createdAt));

  return c.json(rows, 200);
});

// POST /api/workspaces - Create workspace
baseApp.post("/", requireAuth, async (c) => {
  const session = c.get("session");
  const body = await c.req.json<unknown>().catch(() => null);

  if (!isRecord(body)) {
    return c.json({ error: "Invalid payload" }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return c.json({ error: "Workspace name is required" }, 400);
  }

  const slugBase = toSlug(name) || "workspace";
  const slug = `${slugBase}-${crypto.randomUUID().split("-")[0]}`;

  const insertedRows = await c.get("db").insert(workspaces).values({
    name,
    slug,
    createdByUserId: session.user.id,
  }).returning({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug });

  return c.json(insertedRows[0], 201);
});

export { baseApp };
