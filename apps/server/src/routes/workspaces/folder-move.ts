import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { folders } from "@/db/schema";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveFolderId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";
import { requireAuth } from "@/routes/middleware/require-auth";
import type { Variables, DbClient } from "@/routes/types";
import { isRecord } from "@/routes/types";

const app = new Hono<{ Variables: Variables }>();

const isDescendant = (
  targetId: number,
  candidateParentId: number | null,
  parentMap: Map<number, number | null>
) => {
  let current = candidateParentId;
  while (current != null) {
    if (current === targetId) {
      return true;
    }
    current = parentMap.get(current) ?? null;
  }
  return false;
};

// PATCH /:workspaceSlug/folders/:folderId/move - Move a folder to a new parent
app.patch("/", requireAuth, async (c) => {
  const db = c.get("db");
  const workspaceSlug = c.req.param("workspaceSlug");
  const folderPublicId = c.req.param("folderId");

  const validatedSlug = parseSlug(workspaceSlug);
  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const folderPublicIdValue = parsePublicId(folderPublicId);
  if (!folderPublicIdValue) {
    return c.json({ error: "Invalid folder public ID" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const folderIdValue = await resolveFolderId(folderPublicIdValue);
  if (!folderIdValue) {
    return c.json({ error: "Folder not found" }, 404);
  }

  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body)) {
    return c.json({ error: "Invalid payload" }, 400);
  }

  const parentIdRaw = body.parentId;
  const parentIdValue = parentIdRaw == null ? null : (typeof parentIdRaw === "string" ? parsePublicId(parentIdRaw) : null);

  if (parentIdRaw != null && !parentIdValue) {
    return c.json({ error: "Invalid parent id" }, 400);
  }

  let resolvedParentId: number | null = null;
  if (parentIdValue) {
    resolvedParentId = await resolveFolderId(parentIdValue);
    if (!resolvedParentId) {
      return c.json({ error: "Parent folder not found" }, 404);
    }
  }

  if (resolvedParentId === folderIdValue) {
    return c.json({ error: "Folder cannot be its own parent" }, 400);
  }

  const currentFolder = await db
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(and(eq(folders.workspaceId, workspaceIdValue), eq(folders.id, folderIdValue)))
    .limit(1);

  if (currentFolder.length === 0) {
    return c.json({ error: "Folder not found" }, 404);
  }

  if (resolvedParentId) {
    const parentFolder = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.workspaceId, workspaceIdValue), eq(folders.id, resolvedParentId)))
      .limit(1);

    if (parentFolder.length === 0) {
      return c.json({ error: "Parent folder not found" }, 404);
    }
  }

  const folderRows = await db
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceIdValue));

  const parentMap = new Map<number, number | null>();
  folderRows.forEach((row) => {
    parentMap.set(row.id, row.parentId);
  });

  if (isDescendant(folderIdValue, resolvedParentId, parentMap)) {
    return c.json({ error: "Folder cannot be moved into its descendant" }, 400);
  }

  const updatedRows = await db
    .update(folders)
    .set({ parentId: resolvedParentId, updatedAt: new Date() })
    .where(eq(folders.id, folderIdValue))
    .returning({
      id: folders.id,
      publicId: folders.publicId,
      name: folders.name,
      displayName: folders.displayName,
      parentId: folders.parentId,
    });

  const updated = updatedRows[0];

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "folder.updated",
    data: updated,
  });

  return c.json(updated);
});

export { app };
