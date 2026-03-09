import { Hono } from "hono";
import { eq, and, isNull, type SQL } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { notes, folders, revisions } from "@/db/schema";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId } from "@/lib/resolvers";
import { verifyBearerToken } from "@/lib/auth-utils";
import { db } from "@/db";
import { isValidFolderName } from "@/lib/folder-name";
import { isRecord } from "@/routes/types";
import { workspaceEventHub } from "@/lib/sse-hub";
import { buildNoteFolderPath } from "@/routes/workspaces/note-content";
import { pushExternalUpdateToRoom } from "@/collab-ws/checkpoints";

const pushApp = new Hono();

// Sync push change types
interface SyncPushChangeCreate {
  type: "create";
  name: string;
  title: string;
  content: string;
  folderPath?: string;
  tempId?: string;
}

interface SyncPushChangeUpdate {
  type: "update";
  publicId: string;
  name: string;
  title: string;
  content: string;
  folderPath?: string;
  expectedMtime: string;
}

interface SyncPushChangeDelete {
  type: "delete";
  publicId: string;
}

interface SyncPushChangeFolderCreate {
  type: "folder.create";
  name: string;
  parentPath?: string | null;
}

interface SyncPushChangeFolderDelete {
  type: "folder.delete";
  publicId: string;
}

type SyncPushChange =
  | SyncPushChangeCreate
  | SyncPushChangeUpdate
  | SyncPushChangeDelete
  | SyncPushChangeFolderCreate
  | SyncPushChangeFolderDelete;

// Response types
interface AcceptedItem {
  publicId: string;
  status: string;
}

interface CreatedItem {
  tempId?: string;
  publicId: string;
  id: number;
  status: string;
}

interface ConflictItem {
  publicId: string;
  reason: string;
  remoteMtime: string;
  expectedMtime: string;
}

interface ErrorItem {
  publicId?: string;
  tempId?: string;
  error: string;
}

interface SyncPushRequest {
  workspaceSlug: string;
  changes: SyncPushChange[];
}

interface SyncPushResponse {
  accepted: AcceptedItem[];
  created: CreatedItem[];
  conflicts: ConflictItem[];
  errors: ErrorItem[];
}

/**
 * Resolve folder ID from folder path
 * Creates intermediate folders if they don't exist
 */
async function resolveFolderIdFromPath(
  folderPath: string | undefined,
  workspaceId: number,
  dbClient: typeof db
): Promise<number | null> {
  if (!folderPath || folderPath === "") {
    return null;
  }

  const pathParts = folderPath.split("/").filter(Boolean);
  if (pathParts.length === 0) {
    return null;
  }

  let parentId: number | null = null;
  let currentFolderId: number | null = null;

  for (const part of pathParts) {
    if (!isValidFolderName(part)) {
      // Invalid folder name, skip
      continue;
    }

    // Try to find existing folder
    const folderFilter: SQL = parentId === null
      ? and(
          eq(folders.workspaceId, workspaceId),
          eq(folders.name, part),
          isNull(folders.parentId)
        )!
      : and(
          eq(folders.workspaceId, workspaceId),
          eq(folders.name, part),
          eq(folders.parentId, parentId)
        )!;

    const existingFolder: Array<{ id: number; name: string; parentId: number | null }> = await dbClient
      .select({
        id: folders.id,
        name: folders.name,
        parentId: folders.parentId,
      })
      .from(folders)
      .where(folderFilter)
      .limit(1);

    if (existingFolder[0]) {
      currentFolderId = existingFolder[0].id;
    } else {
      // Create the folder
      const inserted: Array<{ id: number }> = await dbClient
        .insert(folders)
        .values({
          workspaceId,
          parentId,
          name: part,
          displayName: part,
        })
        .returning({
          id: folders.id,
        });

      currentFolderId = inserted[0]!.id;
    }

    parentId = currentFolderId;
  }

  return currentFolderId;
}

/**
 * POST /api/sync/push - Push local changes to remote
 *
 * Request body:
 * {
 *   workspaceSlug: string,
 *   changes: Array<{
 *     type: "create" | "update" | "delete",
 *     name?: string,
 *     title?: string,
 *     content?: string,
 *     folderPath?: string,
 *     publicId?: string,
 *     expectedMtime?: string,
 *     tempId?: string
 *   }>
 * }
 *
 * Response:
 * {
 *   accepted: Array<{ publicId: string, status: string }>,
 *   created: Array<{ tempId?: string, publicId: string, id: number, status: string }>,
 *   conflicts: Array<{ publicId: string, reason: string, remoteMtime: string, expectedMtime: string }>,
 *   errors: Array<{ publicId?: string, tempId?: string, error: string }>
 * }
 */
pushApp.post("/", async (c) => {
  // Verify JWT Bearer token
  const payload = await verifyBearerToken(c.req.raw);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Parse request body
  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body)) {
    return c.json({ error: "Invalid payload" }, 400);
  }

  const workspaceSlug = typeof body.workspaceSlug === "string" ? body.workspaceSlug : "";
  const changesRaw = body.changes;

  if (!workspaceSlug) {
    return c.json({ error: "workspaceSlug is required" }, 400);
  }

  if (!Array.isArray(changesRaw)) {
    return c.json({ error: "changes must be an array" }, 400);
  }

  // Validate workspace slug
  const validatedSlug = parseSlug(workspaceSlug);
  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  // Resolve workspace ID
  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  // Process each change
  const accepted: AcceptedItem[] = [];
  const created: CreatedItem[] = [];
  const conflicts: ConflictItem[] = [];
  const errors: ErrorItem[] = [];

  for (const changeRaw of changesRaw) {
    if (!isRecord(changeRaw)) {
      errors.push({ error: "Invalid change format" });
      continue;
    }

    const changeType = changeRaw.type;
    const tempId = changeRaw.tempId as string | undefined;

    try {
      if (changeType === "create") {
        // Process create change
        const name = typeof changeRaw.name === "string" ? changeRaw.name.trim() : "";
        const title = typeof changeRaw.title === "string" ? changeRaw.title.trim() : "";
        const content = typeof changeRaw.content === "string" ? changeRaw.content : "";
        const folderPath = typeof changeRaw.folderPath === "string" ? changeRaw.folderPath : undefined;

        if (!name) {
          errors.push({ tempId, error: "Note name is required" });
          continue;
        }

        if (!title) {
          errors.push({ tempId, error: "Note title is required" });
          continue;
        }

        if (!isValidFolderName(name)) {
          errors.push({
            tempId,
            error: "Note name must be kebab-case, camelCase, snake_case, or PascalCase",
          });
          continue;
        }

        // Resolve folder ID from path
        const folderIdValue = await resolveFolderIdFromPath(folderPath, workspaceIdValue, db);

        // Generate new publicId
        const publicId = createId();

        // Insert the new note
        const insertedRows = await db
          .insert(notes)
          .values({
            workspaceId: workspaceIdValue,
            folderId: folderIdValue,
            name,
            title,
            content,
          })
          .returning({
            id: notes.id,
            publicId: notes.publicId,
          });

        const inserted = insertedRows[0]!;

        created.push({
          tempId,
          publicId: inserted.publicId,
          id: inserted.id,
          status: "created",
        });

        // Build folder path for SSE event
        const createdFolderPath = folderIdValue
          ? await buildNoteFolderPath(folderIdValue, workspaceIdValue, db)
          : null;

        // Emit SSE event for note creation
        workspaceEventHub.publish({
          workspaceId: workspaceIdValue,
          type: "note.created",
          data: {
            id: inserted.id,
            publicId: inserted.publicId,
            name,
            title,
            content,
            folderId: folderIdValue,
            folderPath: createdFolderPath,
            updatedAt: new Date().toISOString(),
          },
        });
      } else if (changeType === "update") {
        // Process update change
        const publicIdRaw = changeRaw.publicId as string | undefined;
        const name = typeof changeRaw.name === "string" ? changeRaw.name.trim() : "";
        const title = typeof changeRaw.title === "string" ? changeRaw.title.trim() : "";
        const content = typeof changeRaw.content === "string" ? changeRaw.content : "";
        const folderPath = typeof changeRaw.folderPath === "string" ? changeRaw.folderPath : undefined;
        const expectedMtimeRaw = changeRaw.expectedMtime as string | undefined;

        if (!publicIdRaw) {
          errors.push({ error: "publicId is required for update" });
          continue;
        }

        if (!name || !title) {
          errors.push({ publicId: publicIdRaw, error: "Note name and title are required" });
          continue;
        }

        if (!isValidFolderName(name)) {
          errors.push({
            publicId: publicIdRaw,
            error: "Note name must be kebab-case, camelCase, snake_case, or PascalCase",
          });
          continue;
        }

        const publicIdValue = parsePublicId(publicIdRaw);
        if (!publicIdValue) {
          errors.push({ publicId: publicIdRaw, error: "Invalid publicId" });
          continue;
        }

        // Find the note (exclude soft-deleted notes)
        const existingNote = await db
          .select({
            id: notes.id,
            publicId: notes.publicId,
            updatedAt: notes.updatedAt,
          })
          .from(notes)
          .where(and(eq(notes.publicId, publicIdValue), isNull(notes.deletedAt)))
          .limit(1);

        if (!existingNote[0]) {
          errors.push({ publicId: publicIdRaw, error: "Note not found" });
          continue;
        }

        const noteId = existingNote[0].id;
        const remoteUpdatedAt = new Date(existingNote[0].updatedAt);

        // Check for conflict if expectedMtime is provided
        if (expectedMtimeRaw) {
          const expectedMtime = new Date(expectedMtimeRaw);
          if (!isNaN(expectedMtime.getTime()) && remoteUpdatedAt > expectedMtime) {
            // Conflict detected
            conflicts.push({
              publicId: publicIdRaw,
              reason: "remote_modified",
              remoteMtime: remoteUpdatedAt.toISOString(),
              expectedMtime: expectedMtimeRaw,
            });
            continue;
          }
        }

        // Resolve folder ID from path
        const folderIdValue = await resolveFolderIdFromPath(folderPath, workspaceIdValue, db);

        // Create a revision record for history tracking
        await db.insert(revisions).values({
          workspaceId: workspaceIdValue,
          noteId: noteId,
          authorUserId: "sync", // Use "sync" to identify sync-pushed changes
          content: content,
          createdAt: new Date(),
        });

        // Update the note
        await db
          .update(notes)
          .set({
            name,
            title,
            content,
            folderId: folderIdValue,
            updatedAt: new Date(),
          })
          .where(eq(notes.id, noteId));

        // Push update to Yjs collaboration room if active
        // This ensures connected users see the sync update in real-time
        const roomName = `${workspaceIdValue}/${publicIdRaw}`;
        try {
          const pushed = await pushExternalUpdateToRoom(roomName, content, "sync");
          if (pushed) {
            console.log(`[sync-push] Pushed update to collab room: ${roomName}`);
          }
        } catch (error) {
          console.warn(`[sync-push] Failed to push to collab room: ${roomName}`, error);
        }

        accepted.push({
          publicId: publicIdRaw,
          status: "updated",
        });

        // Build folder path for SSE event
        const computedFolderPath = folderIdValue
          ? await buildNoteFolderPath(folderIdValue, workspaceIdValue, db)
          : null;

        // Emit SSE event for note update
        workspaceEventHub.publish({
          workspaceId: workspaceIdValue,
          type: "note.updated",
          data: {
            id: noteId,
            publicId: publicIdRaw,
            name,
            title,
            content,
            folderId: folderIdValue,
            folderPath: computedFolderPath,
            updatedAt: new Date().toISOString(),
          },
        });
      } else if (changeType === "delete") {
        // Process delete change
        const publicIdRaw = changeRaw.publicId as string | undefined;

        if (!publicIdRaw) {
          errors.push({ error: "publicId is required for delete" });
          continue;
        }

        const publicIdValue = parsePublicId(publicIdRaw);
        if (!publicIdValue) {
          errors.push({ publicId: publicIdRaw, error: "Invalid publicId" });
          continue;
        }

        // Find the note
        const existingNote = await db
          .select({ id: notes.id })
          .from(notes)
          .where(eq(notes.publicId, publicIdValue))
          .limit(1);

        if (!existingNote[0]) {
          errors.push({ publicId: publicIdRaw, error: "Note not found" });
          continue;
        }

        const noteId = existingNote[0].id;

        // Soft delete: mark note as deleted instead of hard deleting
        await db
          .update(notes)
          .set({ deletedAt: new Date() })
          .where(eq(notes.id, noteId));

        accepted.push({
          publicId: publicIdRaw,
          status: "deleted",
        });

        // Emit SSE event for note deletion
        workspaceEventHub.publish({
          workspaceId: workspaceIdValue,
          type: "note.deleted",
          data: {
            id: noteId,
            publicId: publicIdRaw,
          },
        });
      } else if (changeType === "folder.create") {
        // Process folder create change
        const name = typeof changeRaw.name === "string" ? changeRaw.name.trim() : "";
        const parentPath = changeRaw.parentPath as string | undefined | null;

        if (!name) {
          errors.push({ error: "Folder name is required" });
          continue;
        }

        if (!isValidFolderName(name)) {
          errors.push({
            error: "Folder name must be kebab-case, camelCase, snake_case, or PascalCase",
          });
          continue;
        }

        // Resolve parent folder ID from path
        const parentId = parentPath
          ? await resolveFolderIdFromPath(parentPath, workspaceIdValue, db)
          : null;

        // Check if folder already exists
        const existingFolder = await db
          .select({ id: folders.id, publicId: folders.publicId })
          .from(folders)
          .where(
            and(
              eq(folders.workspaceId, workspaceIdValue),
              eq(folders.name, name),
              parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId)
            )
          )
          .limit(1);

        if (existingFolder[0]) {
          // Folder exists, return its publicId (idempotent operation)
          created.push({
            publicId: existingFolder[0].publicId,
            id: existingFolder[0].id,
            status: "created",
          });
          continue;
        }

        // Create folder
        const inserted = await db
          .insert(folders)
          .values({
            workspaceId: workspaceIdValue,
            parentId,
            name,
            displayName: name,
          })
          .returning({ id: folders.id, publicId: folders.publicId });

        created.push({
          publicId: inserted[0]!.publicId,
          id: inserted[0]!.id,
          status: "created",
        });

        // Emit SSE event for folder creation
        workspaceEventHub.publish({
          workspaceId: workspaceIdValue,
          type: "folder.created",
          data: {
            id: inserted[0]!.id,
            publicId: inserted[0]!.publicId,
            name,
            displayName: name,
            parentId,
            updatedAt: new Date().toISOString(),
          },
        });
      } else if (changeType === "folder.delete") {
        // Process folder delete change
        const publicIdRaw = changeRaw.publicId as string | undefined;

        if (!publicIdRaw) {
          errors.push({ error: "publicId is required for folder.delete" });
          continue;
        }

        const publicIdValue = parsePublicId(publicIdRaw);
        if (!publicIdValue) {
          errors.push({ publicId: publicIdRaw, error: "Invalid publicId" });
          continue;
        }

        // Find the folder
        const folder = await db
          .select({ id: folders.id })
          .from(folders)
          .where(eq(folders.publicId, publicIdValue))
          .limit(1);

        if (!folder[0]) {
          errors.push({ publicId: publicIdRaw, error: "Folder not found" });
          continue;
        }

        // Check if folder has notes (prevent deletion if not empty)
        const notesInFolder = await db
          .select({ id: notes.id })
          .from(notes)
          .where(and(eq(notes.folderId, folder[0].id), isNull(notes.deletedAt)))
          .limit(1);

        if (notesInFolder[0]) {
          errors.push({
            publicId: publicIdRaw,
            error: "Cannot delete non-empty folder",
          });
          continue;
        }

        // Delete folder
        await db.delete(folders).where(eq(folders.id, folder[0].id));

        accepted.push({
          publicId: publicIdRaw,
          status: "deleted",
        });

        // Emit SSE event for folder deletion
        workspaceEventHub.publish({
          workspaceId: workspaceIdValue,
          type: "folder.deleted",
          data: {
            publicId: publicIdRaw,
          },
        });
      } else {
        // Unknown change type
        errors.push({ error: `Unknown change type: ${changeType}` });
      }
    } catch (err) {
      // Handle unexpected errors
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      if (tempId) {
        errors.push({ tempId, error: errorMessage });
      } else if (changeRaw.publicId) {
        errors.push({ publicId: changeRaw.publicId as string, error: errorMessage });
      } else {
        errors.push({ error: errorMessage });
      }
    }
  }

  const response: SyncPushResponse = {
    accepted,
    created,
    conflicts,
    errors,
  };

  return c.json(response, 200);
});

export { pushApp };
