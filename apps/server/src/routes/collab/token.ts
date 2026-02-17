import { SignJWT } from "jose";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { notes } from "@/db/schema";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveNoteId } from "@/lib/resolvers";
import { requireAuth } from "@/routes/middleware/require-auth";
import type { Variables } from "@/routes/types";
import { isRecord } from "@/routes/types";

const TOKEN_TTL_SECONDS = 10 * 60;

const getTokenSecret = () => {
  const secret = global.KONTEXTED_CONFIG.collab.tokenSecret;
  return new TextEncoder().encode(secret);
};

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

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_TTL_SECONDS;
  const token = await new SignJWT({
    workspaceId: workspaceIdValue,
    notePublicId: notePublicIdValue,
    noteId: noteIdValue,
    userId: session.user.id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(getTokenSecret());

  return c.json({ token, expiresAt });
});

export { app };
