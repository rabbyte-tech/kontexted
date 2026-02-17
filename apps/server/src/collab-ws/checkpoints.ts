import * as Y from "yjs";
import { and, eq, gt, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { db } from "@/db";
import { noteLineBlame, notes, revisions } from "@/db/schema";
import type * as sqliteSchema from "@/db/schema/sqlite";
import { getRoom } from "./y-websocket-server";

type DbSchema = typeof import("@/db/schema").schema;

const dialect = process.env.DATABASE_DIALECT === "sqlite" ? "sqlite" : "postgresql";

const DEBOUNCE_MS = 5000;

export const getOrCreateDoc = (docName: string) => {
  return getRoom(docName);
};

type RoomState = {
  roomName: string;
  workspaceId: number;
  noteId: number;
  doc: ReturnType<typeof getRoom>;
  yText: Y.Text;
  lastCheckpointContent: string;
  lastSavedAt: Date | null;
  pendingAuthorUserId: string | null;
  debounceTimer: NodeJS.Timeout | null;
  hasUnsavedChanges: boolean;
  checkpointInFlight: boolean;
  workspaceSlug: string;
  notePublicId: string;
};

type BlameRow = {
  lineNumber: number;
  authorUserId: string;
  revisionId: number;
  touchedAt: Date;
};

type CheckpointResult = {
  saved: boolean;
  revisionId?: number;
  blame?: BlameRow[];
};

const roomStates = new Map<string, RoomState>();

const parseRoomName = (roomName: string) => {
  const [workspaceIdRaw, noteIdRaw] = roomName.split("/");
  const workspaceId = Number(workspaceIdRaw);
  const noteId = Number(noteIdRaw);

  if (!Number.isFinite(workspaceId) || !Number.isFinite(noteId)) {
    throw new Error(`Invalid room name ${roomName}`);
  }

  return { workspaceId, noteId };
};

const diffLines = (previous: string[], next: string[]) => {
  const prevLength = previous.length;
  const nextLength = next.length;
  const table: number[][] = Array.from({ length: prevLength + 1 }, () =>
    Array(nextLength + 1).fill(0)
  );

  for (let i = prevLength - 1; i >= 0; i -= 1) {
    for (let j = nextLength - 1; j >= 0; j -= 1) {
      if (previous[i] === next[j]) {
        table[i][j] = table[i + 1][j + 1] + 1;
      } else {
        table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
  }

  type DiffOp =
    | { type: "equal"; prevIndex: number; nextIndex: number }
    | { type: "delete"; prevIndex: number }
    | { type: "insert"; nextIndex: number };

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;

  while (i < prevLength && j < nextLength) {
    if (previous[i] === next[j]) {
      ops.push({ type: "equal", prevIndex: i, nextIndex: j });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: "delete", prevIndex: i });
      i += 1;
    } else {
      ops.push({ type: "insert", nextIndex: j });
      j += 1;
    }
  }

  while (i < prevLength) {
    ops.push({ type: "delete", prevIndex: i });
    i += 1;
  }

  while (j < nextLength) {
    ops.push({ type: "insert", nextIndex: j });
    j += 1;
  }

  return ops;
};

const buildNextBlame = (
  previousContent: string,
  nextContent: string,
  previousBlame: BlameRow[],
  authorUserId: string,
  revisionId: number
) => {
  const prevLines = previousContent.split("\n");
  const nextLines = nextContent.split("\n");
  const blameByLine = new Map(
    previousBlame.map((row) => [row.lineNumber, row])
  );

  const ops = diffLines(prevLines, nextLines);
  const nextBlame: BlameRow[] = [];
  const now = new Date();
  let nextLineNumber = 1;

  ops.forEach((op) => {
    if (op.type === "equal") {
      const prevLineNumber = op.prevIndex + 1;
      const previous = blameByLine.get(prevLineNumber);
      if (previous) {
        nextBlame.push({
          lineNumber: nextLineNumber,
          authorUserId: previous.authorUserId,
          revisionId: previous.revisionId,
          touchedAt: previous.touchedAt,
        });
      } else {
        nextBlame.push({
          lineNumber: nextLineNumber,
          authorUserId,
          revisionId,
          touchedAt: now,
        });
      }
      nextLineNumber += 1;
      return;
    }

    if (op.type === "insert") {
      nextBlame.push({
        lineNumber: nextLineNumber,
        authorUserId,
        revisionId,
        touchedAt: now,
      });
      nextLineNumber += 1;
    }
  });

  return nextBlame;
};

export const ensureRoomState = async (roomName: string, workspaceId: number, noteId: number, workspaceSlug: string, notePublicId: string) => {
  const existing = roomStates.get(roomName);
  if (existing) {
    return existing;
  }

  console.log(`[collab] Creating new room state: ${roomName}`);

  const doc = getRoom(roomName);
  if (!doc) {
    throw new Error(`Missing Yjs doc for ${roomName}`);
  }
  const note = await db
    .select({ content: notes.content, updatedAt: notes.updatedAt })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.workspaceId, workspaceId)))
    .limit(1);

  if (note.length === 0) {
    throw new Error(`Note not found for ${roomName}`);
  }

  const yText = doc.yText;
  const content = note[0].content ?? "";

  const state: RoomState = {
    roomName,
    workspaceId,
    noteId,
    doc,
    yText,
    lastCheckpointContent: content,
    lastSavedAt: note[0]?.updatedAt ?? null,
    pendingAuthorUserId: null,
    debounceTimer: null,
    hasUnsavedChanges: false,
    checkpointInFlight: false,
    workspaceSlug,
    notePublicId,
  };

  roomStates.set(roomName, state);
  pushStatusUpdate(state, { hasUnsavedChanges: false, lastSavedAt: state.lastSavedAt });
  return state;
};

const pushStatusUpdate = (
  state: RoomState,
  overrides?: {
    hasUnsavedChanges?: boolean;
    lastSavedAt?: Date | null;
    checkpointInFlight?: boolean;
  }
) => {
  const statusMap = state.doc.getMap("status");
  const hasUnsavedChanges = overrides?.hasUnsavedChanges ?? state.hasUnsavedChanges;
  const lastSavedAt = overrides?.lastSavedAt ?? state.lastSavedAt;
  const checkpointInFlight = overrides?.checkpointInFlight ?? state.checkpointInFlight;

  statusMap.set("hasUnsavedChanges", hasUnsavedChanges);
  statusMap.set("lastSavedAt", lastSavedAt ? lastSavedAt.toISOString() : null);
  statusMap.set("checkpointInFlight", checkpointInFlight);
};

const scheduleCheckpoint = (state: RoomState) => {
  if (!roomStates.has(state.roomName)) {
    return;
  }

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  state.debounceTimer = setTimeout(() => {
    if (!roomStates.has(state.roomName)) {
      return;
    }

    void checkpointRoom(state.roomName).catch((error) => {
      console.warn("Checkpoint failed", error);
    });
  }, DEBOUNCE_MS);
};

export const markRoomActivity = async (roomName: string, authorUserId: string) => {
  const state = roomStates.get(roomName);
  if (!state) {
    console.log(`[collab] markRoomActivity: no room state for ${roomName}`);
    return;
  }
  state.pendingAuthorUserId = authorUserId;
  state.hasUnsavedChanges = true;
  pushStatusUpdate(state, { hasUnsavedChanges: true, checkpointInFlight: false });
  scheduleCheckpoint(state);
};

export const clearRoomState = (roomName: string) => {
  const state = roomStates.get(roomName);
  if (!state) {
    return;
  }

  console.log(`[collab] Clearing room state: ${roomName}`);

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  roomStates.delete(roomName);
  console.log(`[collab] Room state cleared: ${roomName} (remaining rooms: ${roomStates.size})`);
};

export const checkpointRoom = async (
  roomName: string,
  options?: { authorUserId?: string; includeBlame?: boolean; forceSeed?: boolean }
): Promise<CheckpointResult> => {
  const state = roomStates.get(roomName);
  if (!state) {
    return { saved: false };
  }

  if (state.checkpointInFlight) {
    state.hasUnsavedChanges = true;
    scheduleCheckpoint(state);
    return { saved: false };
  }

  const authorUserId = options?.authorUserId ?? state.pendingAuthorUserId;
  if (!authorUserId) {
    return { saved: false };
  }

  const currentContent = state.yText.toString();
  const isContentSame = currentContent === state.lastCheckpointContent;

  if (isContentSame && !options?.forceSeed) {
    console.log(`[collab] Checkpoint skipped for ${roomName}: content unchanged`);
    state.hasUnsavedChanges = false;
    state.checkpointInFlight = false;
    pushStatusUpdate(state, { hasUnsavedChanges: false, checkpointInFlight: false });
    return { saved: false };
  }

  if (isContentSame && options?.forceSeed) {
    const existing = await db
      .select({ count: sql<number>`count(*)` })
      .from(noteLineBlame)
      .where(eq(noteLineBlame.noteId, state.noteId));
    if (existing[0]?.count && Number(existing[0].count) > 0) {
      state.hasUnsavedChanges = false;
      state.checkpointInFlight = false;
      pushStatusUpdate(state, { hasUnsavedChanges: false, checkpointInFlight: false });
      return { saved: false };
    }
  }

  state.checkpointInFlight = true;
  pushStatusUpdate(state, { checkpointInFlight: true });

  console.log(`[collab] Starting checkpoint for ${roomName}`);

  try {
    const sqliteDb = db as unknown as BetterSQLite3Database<DbSchema>;

    const sqliteTables = {
      noteLineBlame: noteLineBlame as unknown as typeof sqliteSchema.noteLineBlame,
      notes: notes as unknown as typeof sqliteSchema.notes,
      revisions: revisions as unknown as typeof sqliteSchema.revisions,
    };

    const runCheckpointSqlite = () =>
      sqliteDb.transaction((tx) => {
        const inserted = tx
          .insert(sqliteTables.revisions)
          .values({
            workspaceId: state.workspaceId,
            noteId: state.noteId,
            authorUserId,
            content: currentContent,
          })
          .run();

        const revisionId = Number(inserted.lastInsertRowid);
        if (!revisionId) {
          throw new Error("Failed to create revision");
        }

        tx
          .update(sqliteTables.notes)
          .set({
            content: currentContent,
            updatedAt: new Date(),
          })
          .where(and(eq(sqliteTables.notes.id, state.noteId), eq(sqliteTables.notes.workspaceId, state.workspaceId)))
          .run();

        const existingBlame = tx
          .select({
            lineNumber: sqliteTables.noteLineBlame.lineNumber,
            authorUserId: sqliteTables.noteLineBlame.authorUserId,
            revisionId: sqliteTables.noteLineBlame.revisionId,
            touchedAt: sqliteTables.noteLineBlame.touchedAt,
          })
          .from(sqliteTables.noteLineBlame)
          .where(eq(sqliteTables.noteLineBlame.noteId, state.noteId))
          .orderBy(sqliteTables.noteLineBlame.lineNumber)
          .all();

        const nextBlame = buildNextBlame(
          state.lastCheckpointContent,
          currentContent,
          existingBlame,
          authorUserId,
          revisionId
        );

        if (nextBlame.length > 0) {
          tx
            .insert(sqliteTables.noteLineBlame)
            .values(
              nextBlame.map((row) => ({
                noteId: state.noteId,
                lineNumber: row.lineNumber,
                authorUserId: row.authorUserId,
                revisionId: row.revisionId,
                touchedAt: row.touchedAt,
              }))
            )
            .onConflictDoUpdate({
              target: [sqliteTables.noteLineBlame.noteId, sqliteTables.noteLineBlame.lineNumber],
              set: {
                authorUserId: sql`excluded.author_user_id`,
                revisionId: sql`excluded.revision_id`,
                touchedAt: sql`excluded.touched_at`,
              },
            })
            .run();
        }

        tx
          .delete(sqliteTables.noteLineBlame)
          .where(and(eq(sqliteTables.noteLineBlame.noteId, state.noteId), gt(sqliteTables.noteLineBlame.lineNumber, nextBlame.length)))
          .run();

        console.log(`[collab] Checkpoint saved for ${roomName}: revision ${revisionId}, ${currentContent.length} chars, ${nextBlame.length} blame entries`);

        return {
          revisionId,
          blame: nextBlame,
        };
      });

    const runCheckpointPostgres = () =>
      db.transaction(async (tx) => {
        const inserted = await tx
          .insert(revisions)
          .values({
            workspaceId: state.workspaceId,
            noteId: state.noteId,
            authorUserId,
            content: currentContent,
          })
          .returning({ id: revisions.id });

        const revisionId = inserted[0]?.id;
        if (!revisionId) {
          throw new Error("Failed to create revision");
        }

        await tx
          .update(notes)
          .set({
            content: currentContent,
            updatedAt: new Date(),
          })
          .where(and(eq(notes.id, state.noteId), eq(notes.workspaceId, state.workspaceId)));

        const existingBlame = await tx
          .select({
            lineNumber: noteLineBlame.lineNumber,
            authorUserId: noteLineBlame.authorUserId,
            revisionId: noteLineBlame.revisionId,
            touchedAt: noteLineBlame.touchedAt,
          })
          .from(noteLineBlame)
          .where(eq(noteLineBlame.noteId, state.noteId))
          .orderBy(noteLineBlame.lineNumber);

        const nextBlame = buildNextBlame(
          state.lastCheckpointContent,
          currentContent,
          existingBlame,
          authorUserId,
          revisionId
        );

        if (nextBlame.length > 0) {
          await tx
            .insert(noteLineBlame)
            .values(
              nextBlame.map((row) => ({
                noteId: state.noteId,
                lineNumber: row.lineNumber,
                authorUserId: row.authorUserId,
                revisionId: row.revisionId,
                touchedAt: row.touchedAt,
              }))
            )
            .onConflictDoUpdate({
              target: [noteLineBlame.noteId, noteLineBlame.lineNumber],
              set: {
                authorUserId: sql`excluded.author_user_id`,
                revisionId: sql`excluded.revision_id`,
                touchedAt: sql`excluded.touched_at`,
              },
            });
        }

        await tx
          .delete(noteLineBlame)
          .where(and(eq(noteLineBlame.noteId, state.noteId), gt(noteLineBlame.lineNumber, nextBlame.length)));

        console.log(`[collab] Checkpoint saved for ${roomName}: revision ${revisionId}, ${currentContent.length} chars, ${nextBlame.length} blame entries`);

        return {
          revisionId,
          blame: nextBlame,
        };
      });

    const result = dialect === "sqlite" ? runCheckpointSqlite() : await runCheckpointPostgres();

    state.lastCheckpointContent = currentContent;
    state.lastSavedAt = new Date();
    const latestContent = state.yText.toString();
    state.hasUnsavedChanges = latestContent !== currentContent;
    state.checkpointInFlight = false;
    pushStatusUpdate(state);

    if (state.hasUnsavedChanges) {
      scheduleCheckpoint(state);
    } else {
      state.pendingAuthorUserId = null;
    }

    return {
      saved: true,
      revisionId: result.revisionId,
      blame: options?.includeBlame ? result.blame : undefined,
    };
  } finally {
    state.checkpointInFlight = false;
    pushStatusUpdate(state, { checkpointInFlight: false });
  }
};

export const manualSaveRoom = async (
  roomName: string,
  authorUserId: string,
  includeBlame = false
): Promise<CheckpointResult> => {
  const state = roomStates.get(roomName);
  if (!state) {
    throw new Error(`Room ${roomName} is not active`);
  }

  state.pendingAuthorUserId = authorUserId;
  return checkpointRoom(roomName, { authorUserId, includeBlame, forceSeed: true });
};

export const getRoomStatus = (roomName: string) => {
  const state = roomStates.get(roomName);
  if (!state) {
    return null;
  }

  return {
    hasUnsavedChanges: state.hasUnsavedChanges,
    lastSavedAt: state.lastSavedAt,
    checkpointInFlight: state.checkpointInFlight,
  };
};

export const seedDocumentIfEmpty = async (
  roomName: string,
  workspaceId: number,
  noteId: number
) => {
  const room = getRoom(roomName);
  if (!room) return;

  const yText = room.yText;

  if (yText.length > 0) {
    console.log(`[collab] Document not empty, skipping seed: ${roomName}`);
    return;
  }

  console.log(`[collab] Seeding empty document: ${roomName}`);

  const note = await db
    .select({ content: notes.content })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.workspaceId, workspaceId)))
    .limit(1);

  if (note.length > 0) {
    const content = note[0].content ?? "";
    yText.insert(0, content);
    console.log(`[collab] Seeded document with ${content.length} characters: ${roomName}`);
  }
};

export const checkNeedsReseed = async (roomName: string): Promise<boolean> => {
  const state = roomStates.get(roomName);
  if (!state) {
    return false;
  }

  const note = await db
    .select({ updatedAt: notes.updatedAt, content: notes.content })
    .from(notes)
    .where(and(eq(notes.id, state.noteId), eq(notes.workspaceId, state.workspaceId)))
    .limit(1);

  if (note.length === 0) {
    return false;
  }

  const dbUpdatedAt = note[0].updatedAt;
  const roomLastSavedAt = state.lastSavedAt;

  if (roomLastSavedAt === null) {
    return true;
  }

  if (dbUpdatedAt.getTime() > roomLastSavedAt.getTime()) {
    return true;
  }

  return false;
};

export const reseedDocumentFromDb = async (roomName: string): Promise<void> => {
  const state = roomStates.get(roomName);
  if (!state) {
    return;
  }

  const note = await db
    .select({ content: notes.content })
    .from(notes)
    .where(and(eq(notes.id, state.noteId), eq(notes.workspaceId, state.workspaceId)))
    .limit(1);

  if (note.length === 0) {
    throw new Error(`Note not found for ${roomName}`);
  }

  const dbContent = note[0].content ?? "";
  const currentContent = state.yText.toString();

  if (currentContent !== dbContent) {
    state.yText.delete(0, state.yText.length);
    state.yText.insert(0, dbContent);
    state.lastCheckpointContent = dbContent;
    console.log(`[collab] Reseeded document with ${dbContent.length} characters (was ${currentContent.length}): ${roomName}`);
  } else {
    console.log(`[collab] Document already up to date, skipping reseed: ${roomName}`);
  }
};

export const pushExternalUpdateToRoom = async (
  roomName: string,
  newContent: string,
  authorUserId: string
): Promise<boolean> => {
  const state = roomStates.get(roomName);
  if (!state) {
    console.log(`[collab] External update skipped (room not active): ${roomName}`);
    return false;
  }

  console.log(`[collab] External update pushed to room: ${roomName}, content length: ${newContent.length}`);

  // Use Yjs transaction for atomic update - this ensures proper sync
  state.doc.transact(() => {
    state.yText.delete(0, state.yText.length);
    state.yText.insert(0, newContent);
  }, authorUserId); // Use authorUserId as origin for tracking

  state.lastCheckpointContent = newContent;
  state.lastSavedAt = new Date();
  state.pendingAuthorUserId = authorUserId;
  state.hasUnsavedChanges = false;

  pushStatusUpdate(state, { hasUnsavedChanges: false });

  console.log(`[collab] External update completed for room: ${roomName}, connections: ${state.doc.conns.size}`);
  return true;
};
