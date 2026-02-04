import { Hono } from "hono";
import { eq, and, asc, desc } from "drizzle-orm";
import { notes, noteLineBlame, revisions, users } from "@/db/schema";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveNoteId, resolveFolderId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";
import { isValidFolderName } from "@/lib/folder-name";
import { requireAuth } from "@/routes/middleware/require-auth";
import type { Variables, DbClient, NoteBody, NoteMoveBody } from "@/routes/types";
import { isRecord } from "@/routes/types";

const app = new Hono<{ Variables: Variables }>();

// GET /api/workspaces/:workspaceSlug/notes/ - List notes in a workspace
app.get("/", requireAuth, async (c) => {
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

  const rows = await db
    .select()
    .from(notes)
    .where(eq(notes.workspaceId, workspaceIdValue));

  return c.json(rows, 200);
});

// GET /api/workspaces/:workspaceSlug/notes/:noteId - Get a specific note
app.get("/:noteId", requireAuth, async (c) => {
  const db = c.get("db");
  const workspaceSlug = c.req.param("workspaceSlug");
  const notePublicId = c.req.param("noteId");

  const validatedSlug = parseSlug(workspaceSlug);
  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const notePublicIdValue = parsePublicId(notePublicId);
  if (!notePublicIdValue) {
    return c.json({ error: "Invalid note id" }, 400);
  }

  const noteIdValue = await resolveNoteId(notePublicIdValue);
  if (!noteIdValue) {
    return c.json({ error: "Note not found" }, 404);
  }

  const rows = await db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.workspaceId, workspaceIdValue),
        eq(notes.id, noteIdValue)
      )
    )
    .limit(1);

  if (!rows[0]) {
    return c.json({ error: "Note not found" }, 404);
  }

  const note = rows[0];

  const blameRows = await db
    .select({
      lineNumber: noteLineBlame.lineNumber,
      authorUserId: noteLineBlame.authorUserId,
      authorName: users.name,
      authorEmail: users.email,
      revisionId: noteLineBlame.revisionId,
      touchedAt: noteLineBlame.touchedAt,
    })
    .from(noteLineBlame)
    .leftJoin(users, eq(noteLineBlame.authorUserId, users.id))
    .where(eq(noteLineBlame.noteId, noteIdValue))
    .orderBy(asc(noteLineBlame.lineNumber));

  const blame = blameRows.map((row) => ({
    lineNumber: row.lineNumber,
    authorUserId: row.authorUserId,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    revisionId: row.revisionId,
    touchedAt: new Date(row.touchedAt).toISOString(),
  }));

  return c.json({ ...note, blame }, 200);
});

// GET /api/workspaces/:workspaceSlug/notes/:noteId/history - Get note revision history
app.get("/:noteId/history", requireAuth, async (c) => {
  const db = c.get("db");
  const workspaceSlug = c.req.param("workspaceSlug");
  const notePublicId = c.req.param("noteId");
  const limitParam = c.req.query("limit");
  let limit = 50;
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      return c.json({ error: "Invalid limit" }, 400);
    }
    limit = Math.min(parsedLimit, 200);
  }

  const validatedSlug = parseSlug(workspaceSlug);
  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const notePublicIdValue = parsePublicId(notePublicId);
  if (!notePublicIdValue) {
    return c.json({ error: "Invalid note id" }, 400);
  }

  const noteIdValue = await resolveNoteId(notePublicIdValue);
  if (!noteIdValue) {
    return c.json({ error: "Note not found" }, 404);
  }

  // Verify note belongs to workspace
  const noteCheck = await db
    .select({ id: notes.id })
    .from(notes)
    .where(
      and(
        eq(notes.workspaceId, workspaceIdValue),
        eq(notes.id, noteIdValue)
      )
    )
    .limit(1);

  if (!noteCheck[0]) {
    return c.json({ error: "Note not found" }, 404);
  }

  const revisionRows = await db
    .select({
      id: revisions.id,
      authorUserId: revisions.authorUserId,
      createdAt: revisions.createdAt,
      authorName: users.name,
      authorEmail: users.email,
      content: revisions.content,
    })
    .from(revisions)
    .leftJoin(users, eq(revisions.authorUserId, users.id))
    .where(eq(revisions.noteId, noteIdValue))
    .orderBy(desc(revisions.createdAt))
    .limit(limit);

  const revisionsData = revisionRows.map((row) => ({
    id: row.id,
    authorUserId: row.authorUserId,
    createdAt: new Date(row.createdAt).toISOString(),
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    content: row.content,
  }));

  return c.json({ revisions: revisionsData }, 200);
});

// POST /api/workspaces/:workspaceSlug/notes/ - Create a new note in a workspace
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

  const title = typeof body.title === "string"
    ? body.title.trim()
    : "";
  const name = typeof body.name === "string"
    ? body.name.trim()
    : "";
  const folderIdRaw = body.folderId;

  if (!title) {
    return c.json({ error: "Note title is required" }, 400);
  }

  if (!name) {
    return c.json({ error: "Note name is required" }, 400);
  }

  if (!isValidFolderName(name)) {
    return c.json(
      {
        error: "Note name must be kebab-case, camelCase, snake_case, or PascalCase",
      },
      400
    );
  }

  let folderIdValue: number | null = null;
  if (folderIdRaw) {
    const folderPublicIdValue = typeof folderIdRaw === "string" ? parsePublicId(folderIdRaw) : null;
    if (!folderPublicIdValue) {
      return c.json({ error: "Invalid folder id" }, 400);
    }

    folderIdValue = await resolveFolderId(folderPublicIdValue);
    if (!folderIdValue) {
      return c.json({ error: "Folder not found" }, 404);
    }
  }

  const insertedRows = await db
    .insert(notes)
    .values({
      workspaceId: workspaceIdValue,
      folderId: folderIdValue,
      name,
      title,
      content: "",
    })
    .returning({
      id: notes.id,
      publicId: notes.publicId,
      name: notes.name,
      title: notes.title,
      folderId: notes.folderId,
    });

  const note = insertedRows[0];

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "note.created",
    data: note,
  });

  return c.json(note, 201);
});

// PATCH /api/workspaces/:workspaceSlug/notes/:noteId - Update a note
app.patch("/:noteId", requireAuth, async (c) => {
  const db = c.get("db");
  const workspaceSlug = c.req.param("workspaceSlug");
  const notePublicId = c.req.param("noteId");

  const validatedSlug = parseSlug(workspaceSlug);
  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const notePublicIdValue = parsePublicId(notePublicId);
  if (!notePublicIdValue) {
    return c.json({ error: "Invalid note id" }, 400);
  }

  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body)) {
    return c.json({ error: "Invalid payload" }, 400);
  }

  const title = typeof body.title === "string"
    ? body.title.trim()
    : "";
  const name = typeof body.name === "string"
    ? body.name.trim()
    : "";

  if (!title) {
    return c.json({ error: "Note title is required" }, 400);
  }

  if (!name) {
    return c.json({ error: "Note name is required" }, 400);
  }

  if (!isValidFolderName(name)) {
    return c.json(
      {
        error: "Note name must be kebab-case, camelCase, snake_case, or PascalCase",
      },
      400
    );
  }

  const noteIdValue = await resolveNoteId(notePublicIdValue);
  if (!noteIdValue) {
    return c.json({ error: "Note not found" }, 404);
  }

  const existing = await db
    .select({ id: notes.id, folderId: notes.folderId })
    .from(notes)
    .where(
      and(
        eq(notes.workspaceId, workspaceIdValue),
        eq(notes.id, noteIdValue)
      )
    )
    .limit(1);

  if (!existing[0]) {
    return c.json({ error: "Note not found" }, 404);
  }

  const updatedRows = await db
    .update(notes)
    .set({ name, title, updatedAt: new Date() })
    .where(
      and(
        eq(notes.workspaceId, workspaceIdValue),
        eq(notes.id, noteIdValue)
      )
    )
    .returning({
      id: notes.id,
      publicId: notes.publicId,
      name: notes.name,
      title: notes.title,
      folderId: notes.folderId,
    });

  const updated = updatedRows[0];

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "note.updated",
    data: updated,
  });

  return c.json(updated, 200);
});

// DELETE /api/workspaces/:workspaceSlug/notes/:noteId - Delete a note
app.delete("/:noteId", requireAuth, async (c) => {
  const db = c.get("db");
  const workspaceSlug = c.req.param("workspaceSlug");
  const notePublicId = c.req.param("noteId");

  const validatedSlug = parseSlug(workspaceSlug);
  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const notePublicIdValue = parsePublicId(notePublicId);
  if (!notePublicIdValue) {
    return c.json({ error: "Invalid note id" }, 400);
  }

  const noteIdValue = await resolveNoteId(notePublicIdValue);
  if (!noteIdValue) {
    return c.json({ error: "Note not found" }, 404);
  }

  const existing = await db
    .select({ id: notes.id })
    .from(notes)
    .where(
      and(
        eq(notes.workspaceId, workspaceIdValue),
        eq(notes.id, noteIdValue)
      )
    )
    .limit(1);

  if (!existing[0]) {
    return c.json({ error: "Note not found" }, 404);
  }

  await db.delete(noteLineBlame).where(eq(noteLineBlame.noteId, noteIdValue));
  await db.delete(revisions).where(eq(revisions.noteId, noteIdValue));
  await db.delete(notes).where(
    and(
      eq(notes.workspaceId, workspaceIdValue),
      eq(notes.id, noteIdValue)
    )
  );

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "note.updated",
    data: { id: noteIdValue },
  });

  return c.json({ success: true }, 200);
});

// PATCH /api/workspaces/:workspaceSlug/notes/:noteId/move - Move a note to a different folder
app.patch("/:noteId/move", requireAuth, async (c) => {
  const db = c.get("db");
  const workspaceSlug = c.req.param("workspaceSlug");
  const notePublicId = c.req.param("noteId");

  const validatedSlug = parseSlug(workspaceSlug);
  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const notePublicIdValue = parsePublicId(notePublicId);
  if (!notePublicIdValue) {
    return c.json({ error: "Invalid note public ID" }, 400);
  }

  const noteIdValue = await resolveNoteId(notePublicIdValue);
  if (!noteIdValue) {
    return c.json({ error: "Note not found" }, 404);
  }

  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body)) {
    return c.json({ error: "Invalid payload" }, 400);
  }

  const folderIdRaw = body.folderId;
  const folderIdValue = folderIdRaw == null ? null : (typeof folderIdRaw === "string" ? parsePublicId(folderIdRaw) : null);

  if (folderIdRaw != null && !folderIdValue) {
    return c.json({ error: "Invalid folder id" }, 400);
  }

  let resolvedFolderId: number | null = null;
  if (folderIdValue) {
    resolvedFolderId = await resolveFolderId(folderIdValue);
    if (!resolvedFolderId) {
      return c.json({ error: "Folder not found" }, 404);
    }
  }

  const existing = await db
    .select({ id: notes.id, folderId: notes.folderId })
    .from(notes)
    .where(
      and(
        eq(notes.workspaceId, workspaceIdValue),
        eq(notes.id, noteIdValue)
      )
    )
    .limit(1);

  if (!existing[0]) {
    return c.json({ error: "Note not found" }, 404);
  }

  const updatedRows = await db
    .update(notes)
    .set({ folderId: resolvedFolderId, updatedAt: new Date() })
    .where(eq(notes.id, noteIdValue))
    .returning({
      id: notes.id,
      publicId: notes.publicId,
      name: notes.name,
      title: notes.title,
      folderId: notes.folderId,
    });

  const updated = updatedRows[0];

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "note.updated",
    data: updated,
  });

  return c.json(updated, 200);
});

export { app };
