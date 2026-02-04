import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { auth } from "@/auth";
import { db } from "@/db";
import { noteLineBlame, notes, revisions, users, workspaces } from "@kontexted/db";
import * as sqliteSchema from "@kontexted/db/schema/sqlite";
import { parseSlug, parsePublicId } from "@/lib/params";
import { buildNextBlame } from "@/lib/blame";
import { workspaceEventHub } from "@/lib/sse-hub";
import { resolveWorkspaceId, resolveNote } from "@/lib/resolvers";

type DbSchema = typeof import("@kontexted/db").schema;

const toIso = (value: Date | number) => (value instanceof Date ? value : new Date(value)).toISOString();

class WorkspaceNotFoundError extends Error {
  name = "WorkspaceNotFoundError";
}

class NoteNotFoundError extends Error {
  name = "NoteNotFoundError";
}

class NoteNotInWorkspaceError extends Error {
  name = "NoteNotInWorkspaceError";
}

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; noteId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId: workspaceSlug, noteId: notePublicId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const content = (body as { content?: unknown }).content;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "Invalid content" }, { status: 400 });
  }

  const includeBlameBody = (body as { includeBlame?: unknown }).includeBlame;
  const includeBlame = includeBlameBody === true;
  if (includeBlameBody !== undefined && typeof includeBlameBody !== "boolean") {
    return NextResponse.json({ error: "Invalid includeBlame" }, { status: 400 });
  }

  let stage = "start";
  let workspaceSlugValue: string | null = null;
  let notePublicIdValue: string | null = null;

  try {
    workspaceSlugValue = parseSlug(workspaceSlug);
    if (!workspaceSlugValue) {
      return NextResponse.json({ error: "Invalid workspace slug" }, { status: 400 });
    }

    notePublicIdValue = parsePublicId(notePublicId);
    if (!notePublicIdValue) {
      return NextResponse.json({ error: "Invalid note public ID" }, { status: 400 });
    }

    const workspaceSlugResolved = workspaceSlugValue!;
    const notePublicIdResolved = notePublicIdValue!;

    const newLineCount = content.split("\n").length;
    const now = new Date();
    const dialect = process.env.DATABASE_DIALECT === "sqlite" ? "sqlite" : "postgresql";

    const runManualSaveSqlite = () => {
      const sqliteDb = db as unknown as BetterSQLite3Database<DbSchema>;
      const sqliteTables = {
        noteLineBlame: noteLineBlame as unknown as typeof sqliteSchema.noteLineBlame,
        notes: notes as unknown as typeof sqliteSchema.notes,
        revisions: revisions as unknown as typeof sqliteSchema.revisions,
        workspaces: workspaces as unknown as typeof sqliteSchema.workspaces,
        users: users as unknown as typeof sqliteSchema.users,
      };

      return sqliteDb.transaction((tx) => {
        stage = "resolve-ids";
        const workspaceRows = tx
          .select({ id: sqliteTables.workspaces.id })
          .from(sqliteTables.workspaces)
          .where(eq(sqliteTables.workspaces.slug, workspaceSlugResolved))
          .all();
        const workspaceRow = workspaceRows[0];
        if (!workspaceRow) {
          throw new WorkspaceNotFoundError();
        }
        const workspaceIdValue = workspaceRow.id;

        const noteRows = tx
          .select({ id: sqliteTables.notes.id, workspaceId: sqliteTables.notes.workspaceId, content: sqliteTables.notes.content })
          .from(sqliteTables.notes)
          .where(eq(sqliteTables.notes.publicId, notePublicIdResolved))
          .all();
        const note = noteRows[0];
        if (!note) {
          throw new NoteNotFoundError();
        }
        if (note.workspaceId !== workspaceIdValue) {
          throw new NoteNotInWorkspaceError();
        }

        const noteIdValue = note.id;
        const previousContent = note.content;

        stage = "fetch-blame";
        const previousBlameRows = tx
          .select({
            lineNumber: sqliteTables.noteLineBlame.lineNumber,
            authorUserId: sqliteTables.noteLineBlame.authorUserId,
            revisionId: sqliteTables.noteLineBlame.revisionId,
            touchedAt: sqliteTables.noteLineBlame.touchedAt,
          })
          .from(sqliteTables.noteLineBlame)
          .where(eq(sqliteTables.noteLineBlame.noteId, noteIdValue))
          .orderBy(asc(sqliteTables.noteLineBlame.lineNumber))
          .all();

        stage = "insert-revision";
        const inserted = tx
          .insert(sqliteTables.revisions)
          .values({
            workspaceId: workspaceIdValue,
            noteId: noteIdValue,
            authorUserId: session.user.id,
            content: content,
            createdAt: now,
          })
          .run();
        const revisionId = Number(inserted.lastInsertRowid);

        stage = "update-note";
        tx
          .update(sqliteTables.notes)
          .set({ content: content, updatedAt: now })
          .where(eq(sqliteTables.notes.id, noteIdValue))
          .run();

        const nextBlame = buildNextBlame(
          previousContent,
          content,
          previousBlameRows,
          session.user.id,
          revisionId
        );

        stage = "upsert-blame";
        for (const blameRow of nextBlame) {
          tx
            .insert(sqliteTables.noteLineBlame)
            .values({
              noteId: noteIdValue,
              lineNumber: blameRow.lineNumber,
              authorUserId: blameRow.authorUserId,
              revisionId: blameRow.revisionId,
              touchedAt: blameRow.touchedAt,
            })
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

        stage = "delete-trailing";
        tx
          .delete(sqliteTables.noteLineBlame)
          .where(
            and(
              eq(sqliteTables.noteLineBlame.noteId, noteIdValue),
              gt(sqliteTables.noteLineBlame.lineNumber, newLineCount)
            )
          )
          .run();

        let blame;
        if (includeBlame) {
          stage = "select-blame";
          const blameRows = tx
            .select({
              lineNumber: sqliteTables.noteLineBlame.lineNumber,
              authorUserId: sqliteTables.noteLineBlame.authorUserId,
              authorName: sqliteTables.users.name,
              authorEmail: sqliteTables.users.email,
              revisionId: sqliteTables.noteLineBlame.revisionId,
              touchedAt: sqliteTables.noteLineBlame.touchedAt,
            })
            .from(sqliteTables.noteLineBlame)
            .leftJoin(sqliteTables.users, eq(sqliteTables.noteLineBlame.authorUserId, sqliteTables.users.id))
            .where(eq(sqliteTables.noteLineBlame.noteId, noteIdValue))
            .orderBy(asc(sqliteTables.noteLineBlame.lineNumber))
            .all();

          blame = blameRows.map((row) => ({
            ...row,
            touchedAt: toIso(row.touchedAt),
          }));
        }

        return {
          revisionId,
          updatedAt: now,
          blame,
          noteId: noteIdValue,
          workspaceId: workspaceIdValue,
        };
      });
    };

    const runManualSavePostgres = async () => {
      return db.transaction(async (tx) => {
        stage = "resolve-ids";
        const workspaceIdValue = await resolveWorkspaceId(workspaceSlugResolved, tx);

        if (workspaceIdValue === null) {
          throw new WorkspaceNotFoundError();
        }

        const note = await resolveNote(notePublicIdResolved, tx);

        if (note === null) {
          throw new NoteNotFoundError();
        }

        if (note.workspaceId !== workspaceIdValue) {
          throw new NoteNotInWorkspaceError();
        }

        const noteIdValue = note.id;
        const previousContent = note.content;

        stage = "fetch-blame";
        const previousBlameRows = await tx
          .select({
            lineNumber: noteLineBlame.lineNumber,
            authorUserId: noteLineBlame.authorUserId,
            revisionId: noteLineBlame.revisionId,
            touchedAt: noteLineBlame.touchedAt,
          })
          .from(noteLineBlame)
          .where(eq(noteLineBlame.noteId, noteIdValue))
          .orderBy(asc(noteLineBlame.lineNumber));

        stage = "insert-revision";
        const revisionRows = await tx
          .insert(revisions)
          .values({
            workspaceId: workspaceIdValue,
            noteId: noteIdValue,
            authorUserId: session.user.id,
            content: content,
            createdAt: now,
          })
          .returning({ id: revisions.id });

        const revision = revisionRows[0];
        const revisionId = revision.id;

        stage = "update-note";
        const updatedNoteRows = await tx
          .update(notes)
          .set({ content: content, updatedAt: now })
          .where(eq(notes.id, noteIdValue))
          .returning({ id: notes.id, updatedAt: notes.updatedAt });

        if (updatedNoteRows.length === 0) {
          throw new NoteNotFoundError();
        }

        const updatedNote = updatedNoteRows[0];

        const nextBlame = buildNextBlame(
          previousContent,
          content,
          previousBlameRows,
          session.user.id,
          revisionId
        );

        stage = "upsert-blame";
        for (const blameRow of nextBlame) {
          await tx
            .insert(noteLineBlame)
            .values({
              noteId: noteIdValue,
              lineNumber: blameRow.lineNumber,
              authorUserId: blameRow.authorUserId,
              revisionId: blameRow.revisionId,
              touchedAt: blameRow.touchedAt,
            })
            .onConflictDoUpdate({
              target: [noteLineBlame.noteId, noteLineBlame.lineNumber],
              set: {
                authorUserId: blameRow.authorUserId,
                revisionId: blameRow.revisionId,
                touchedAt: blameRow.touchedAt,
              },
             });
        }

        stage = "delete-trailing";
        await tx
          .delete(noteLineBlame)
          .where(
            and(
              eq(noteLineBlame.noteId, noteIdValue),
              gt(noteLineBlame.lineNumber, newLineCount)
            )
           );

        let blame;
        if (includeBlame) {
          stage = "select-blame";
          const blameRows = await tx
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

          blame = blameRows.map((row) => ({
            ...row,
            touchedAt: toIso(row.touchedAt),
          }));
        }

        return {
          revisionId,
          updatedAt: updatedNote.updatedAt,
          blame,
          noteId: noteIdValue,
          workspaceId: workspaceIdValue,
        };
      });
    };

    const result = dialect === "sqlite" ? runManualSaveSqlite() : await runManualSavePostgres();

    stage = "publish";
    try {
      workspaceEventHub.publish({
        workspaceId: result.workspaceId,
        type: "note.updated",
        data: { id: result.noteId },
      });
    } catch {
      console.warn("Failed to publish note.updated", { workspaceId: result.workspaceId, noteId: result.noteId });
    }

    stage = "build-response";
    const responseData: {
      updatedAt: string;
      revisionId: number;
      blame?: Array<{
        lineNumber: number;
        authorUserId: string;
        revisionId: number;
        touchedAt: string;
        authorName: string | null;
        authorEmail: string | null;
      }>;
    } = {
      updatedAt: toIso(result.updatedAt),
      revisionId: result.revisionId,
    };

    if (result.blame) {
      responseData.blame = result.blame;
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Manual save failed", {
      stage,
      workspaceSlug: workspaceSlugValue,
      notePublicId: notePublicIdValue,
      includeBlame,
      error: error instanceof Error
        ? { name: error.name, message: error.message }
        : error,
    });
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }

    if (
      error instanceof WorkspaceNotFoundError ||
      error instanceof NoteNotFoundError ||
      error instanceof NoteNotInWorkspaceError
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to save note content" },
      { status: 500 }
    );
  }
}
