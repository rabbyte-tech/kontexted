import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { noteLineBlame, notes, users } from "@/db/schema";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveNoteId } from "@/lib/resolvers";
import { requireAuth } from "@/routes/middleware/require-auth";
import type { Variables } from "@/routes/types";
import { isRecord } from "@/routes/types";
import { manualSaveRoom } from "@/collab-ws/checkpoints";
import { resolveRoomName } from "@/collab-ws/rooms";

const app = new Hono<{ Variables: Variables }>();

app.post("/", requireAuth, async (c) => {
  const session = c.get("session");
  const db = c.get("db");

  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body)) {
    return c.json({ error: "Invalid payload" }, 400);
  }

  const workspaceSlug = typeof body.workspaceSlug === "string" ? body.workspaceSlug : "";
  const notePublicId = typeof body.noteId === "string" ? body.noteId : "";
  const includeBlame = body.includeBlame === true;

  const workspaceSlugValue = parseSlug(workspaceSlug);
  if (!workspaceSlugValue) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const notePublicIdValue = parsePublicId(notePublicId);
  if (!notePublicIdValue) {
    return c.json({ error: "Invalid note public ID" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const noteIdValue = await resolveNoteId(notePublicIdValue);
  if (!noteIdValue) {
    return c.json({ error: "Note not found" }, 404);
  }

  const note = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteIdValue), eq(notes.workspaceId, workspaceIdValue)))
    .limit(1);

  if (note.length === 0) {
    return c.json({ error: "Note not found" }, 404);
  }

  const payload = {
    workspaceId: String(workspaceIdValue),
    notePublicId: notePublicIdValue,
    noteId: String(noteIdValue),
    userId: session.user.id,
  };

  const roomName = resolveRoomName(payload);

  const result = await manualSaveRoom(roomName, payload.userId, includeBlame ?? false);

  if (!includeBlame) {
    return c.json(result);
  }

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
    ...row,
    touchedAt: row.touchedAt.toISOString(),
  }));

  return c.json({ ...payload as Record<string, unknown>, blame });
});

export { app };
