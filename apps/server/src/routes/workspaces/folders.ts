import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { folders, notes, noteLineBlame, revisions } from "@/db/schema";
import { parseSlug, parsePublicId } from "@/lib/params";
import { isValidFolderName } from "@/lib/folder-name";
import { resolveWorkspaceId, resolveFolderId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";
import { requireAuth } from "@/routes/middleware/require-auth";
import type { Variables, DbClient, FolderBody } from "@/routes/types";
import { isRecord } from "@/routes/types";

const app = new Hono<{ Variables: Variables }>();

async function collectFolderIds(folderId: number, workspaceId: number, db: DbClient): Promise<number[]> {
  const childFolders = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.parentId, folderId), eq(folders.workspaceId, workspaceId)));

  let allIds = [folderId];
  for (const child of childFolders) {
    allIds = allIds.concat(await collectFolderIds(child.id, workspaceId, db));
  }
  return allIds;
}

async function collectNoteIds(folderIds: number[], workspaceId: number, db: DbClient): Promise<number[]> {
  const noteRows = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.workspaceId, workspaceId), inArray(notes.folderId, folderIds)));

  return noteRows.map((row: { id: number }) => row.id);
}

// POST /api/workspaces/:workspaceSlug/folders - Create a folder
app.post("/", requireAuth, async (c) => {
  const db = c.get("db");
  const workspaceSlug = c.req.param("workspaceSlug");
  const validatedSlug = parseSlug(workspaceSlug);

  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body)) {
    return c.json({ error: "Invalid payload" }, 400);
  }

  const name = typeof body.name === "string"
    ? body.name.trim()
    : "";
  const displayName = typeof body.displayName === "string"
    ? body.displayName.trim()
    : "";
  const parentIdRaw = body.parentId;
  const parentIdValue = parentIdRaw == null ? null : (typeof parentIdRaw === "string" ? parsePublicId(parentIdRaw) : null);

  if (!displayName) {
    return c.json({ error: "Folder display name is required" }, 400);
  }

  if (!name) {
    return c.json({ error: "Folder name is required" }, 400);
  }

  if (!isValidFolderName(name)) {
    return c.json(
      {
        error: "Folder name must be kebab-case, camelCase, snake_case, or PascalCase",
      },
      400
    );
  }

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

  const insertedRows = await db
    .insert(folders)
    .values({
      workspaceId: workspaceIdValue,
      parentId: resolvedParentId,
      name,
      displayName,
    })
    .returning({
      id: folders.id,
      publicId: folders.publicId,
      name: folders.name,
      displayName: folders.displayName,
      parentId: folders.parentId,
    });

  const folder = insertedRows[0];

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "folder.created",
    data: folder,
  });

  return c.json(folder, 201);
});

// PATCH /api/workspaces/:workspaceSlug/folders/:folderId - Update a folder
app.patch("/:folderId", requireAuth, async (c) => {
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

  const name = typeof body.name === "string"
    ? body.name.trim()
    : "";
  const displayName = typeof body.displayName === "string"
    ? body.displayName.trim()
    : "";

  if (!displayName) {
    return c.json({ error: "Folder display name is required" }, 400);
  }

  if (!name) {
    return c.json({ error: "Folder name is required" }, 400);
  }

  if (!isValidFolderName(name)) {
    return c.json(
      {
        error: "Folder name must be kebab-case, camelCase, snake_case, or PascalCase",
      },
      400
    );
  }

  const folderRow = await db
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(and(eq(folders.workspaceId, workspaceIdValue), eq(folders.id, folderIdValue)))
    .limit(1);

  if (folderRow.length === 0) {
    return c.json({ error: "Folder not found" }, 404);
  }

  const updatedRows = await db
    .update(folders)
    .set({ name, displayName, updatedAt: new Date() })
    .where(and(eq(folders.id, folderIdValue), eq(folders.workspaceId, workspaceIdValue)))
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

  return c.json(updated, 200);
});

// DELETE /api/workspaces/:workspaceSlug/folders/:folderId - Delete a folder recursively
app.delete("/:folderId", requireAuth, async (c) => {
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

  const folderRow = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.workspaceId, workspaceIdValue), eq(folders.id, folderIdValue)))
    .limit(1);

  if (folderRow.length === 0) {
    return c.json({ error: "Folder not found" }, 404);
  }

  const allFolderIds = await collectFolderIds(folderIdValue, workspaceIdValue, db);
  const allNoteIds = await collectNoteIds(allFolderIds, workspaceIdValue, db);

  if (allNoteIds.length > 0) {
    await db.delete(noteLineBlame).where(inArray(noteLineBlame.noteId, allNoteIds));
    await db.delete(revisions).where(inArray(revisions.noteId, allNoteIds));
    await db.delete(notes).where(inArray(notes.id, allNoteIds));
  }

  await db.delete(folders).where(inArray(folders.id, allFolderIds));

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "folder.updated",
    data: { id: folderIdValue },
  });

  return c.json({ success: true }, 200);
});

export { app };
