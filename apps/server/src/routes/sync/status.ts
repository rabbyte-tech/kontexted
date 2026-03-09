import { Hono } from "hono";
import { eq, and, count, desc, isNull } from "drizzle-orm";
import { notes, folders } from "@/db/schema";
import { parseSlug } from "@/lib/params";
import { resolveWorkspaceId } from "@/lib/resolvers";
import { verifyBearerToken } from "@/lib/auth-utils";
import { db } from "@/db";

const statusApp = new Hono();

/**
 * GET /api/sync/status - Get sync status for a workspace
 *
 * Query params:
 * - workspaceSlug (required): The workspace slug
 *
 * Response:
 * {
 *   workspaceSlug: string,
 *   noteCount: number,
 *   folderCount: number,
 *   lastModified: string | null
 * }
 */
statusApp.get("/", async (c) => {
  // Verify JWT Bearer token
  const payload = await verifyBearerToken(c.req.raw);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceSlug = c.req.query("workspaceSlug");

  if (!workspaceSlug) {
    return c.json({ error: "workspaceSlug is required" }, 400);
  }

  const validatedSlug = parseSlug(workspaceSlug);
  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  // Get note count (exclude soft-deleted notes)
  const noteCountResult = await db
    .select({ count: count() })
    .from(notes)
    .where(and(eq(notes.workspaceId, workspaceIdValue), isNull(notes.deletedAt)));

  const noteCount = noteCountResult[0]?.count ?? 0;

  // Get folder count
  const folderCountResult = await db
    .select({ count: count() })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceIdValue));

  const folderCount = folderCountResult[0]?.count ?? 0;

  // Get last modified note to determine lastModified (exclude soft-deleted notes)
  const lastNote = await db
    .select({ updatedAt: notes.updatedAt })
    .from(notes)
    .where(and(eq(notes.workspaceId, workspaceIdValue), isNull(notes.deletedAt)))
    .orderBy(desc(notes.updatedAt))
    .limit(1);

  const lastModified = lastNote[0] ? new Date(lastNote[0].updatedAt).toISOString() : null;

  const response = {
    workspaceSlug: validatedSlug,
    noteCount,
    folderCount,
    lastModified,
  };

  return c.json(response, 200);
});

export { statusApp };
