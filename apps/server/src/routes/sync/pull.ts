import { Hono } from "hono";
import { eq, gt, and, isNull, isNotNull } from "drizzle-orm";
import { notes, folders } from "@/db/schema";
import { parseSlug } from "@/lib/params";
import { resolveWorkspaceId } from "@/lib/resolvers";
import { verifyBearerToken } from "@/lib/auth-utils";
import { db } from "@/db";

const pullApp = new Hono();

interface RemoteNote {
  id: number;
  publicId: string;
  name: string;
  title: string;
  content: string;
  folderId: number | null;
  folderPath: string;
  updatedAt: string;
}

interface RemoteFolder {
  id: number;
  publicId: string;
  name: string;
  displayName: string;
  parentId: number | null;
  folderPath: string;
  updatedAt: string;
  isEmpty?: boolean;
}

/**
 * Build folder path from folder hierarchy
 * @param folderId - The folder ID to build path for
 * @param workspaceId - The workspace ID
 * @param db - Database client
 * @returns The folder path string
 */
async function buildFolderPath(
  folderId: number | null,
  workspaceId: number,
  dbClient: typeof db
): Promise<string> {
  if (!folderId) {
    return "";
  }

  const pathParts: string[] = [];
  let currentId: number | null = folderId;

  while (currentId) {
    const folderRows = await dbClient
      .select({
        id: folders.id,
        name: folders.name,
        parentId: folders.parentId,
      })
      .from(folders)
      .where(and(eq(folders.id, currentId), eq(folders.workspaceId, workspaceId)))
      .limit(1);

    if (!folderRows[0]) {
      break;
    }

    pathParts.unshift(folderRows[0].name);
    currentId = folderRows[0].parentId;
  }

  return pathParts.join("/");
}

/**
 * GET /api/sync/pull - Pull all changes since a timestamp
 *
 * Query params:
 * - workspaceSlug (required): The workspace slug
 * - since (optional): ISO timestamp to pull changes since
 *
 * Response:
 * {
 *   notes: RemoteNote[],
 *   deleted: { publicId: string, deletedAt: string }[],
 *   folders: RemoteFolder[],
 *   syncTimestamp: string
 * }
 */
pullApp.get("/", async (c) => {
  // Verify JWT Bearer token
  const payload = await verifyBearerToken(c.req.raw);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceSlug = c.req.query("workspaceSlug");
  const sinceParam = c.req.query("since");

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

  // Parse the since timestamp if provided
  let since: Date | null = null;
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    if (isNaN(parsed.getTime())) {
      return c.json({ error: "Invalid since timestamp" }, 400);
    }
    since = parsed;
  }

  let noteRows;
  let folderRows;
  let deletedNoteRows;

  if (since) {
    // Query notes where updatedAt > since (exclude soft-deleted notes)
    noteRows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.workspaceId, workspaceIdValue), gt(notes.updatedAt, since), isNull(notes.deletedAt)));

    // Query folders where updatedAt > since
    folderRows = await db
      .select()
      .from(folders)
      .where(and(eq(folders.workspaceId, workspaceIdValue), gt(folders.updatedAt, since)));

    // Query deleted notes where deletedAt > since
    deletedNoteRows = await db
      .select({ publicId: notes.publicId, deletedAt: notes.deletedAt })
      .from(notes)
      .where(
        and(
          eq(notes.workspaceId, workspaceIdValue),
          isNotNull(notes.deletedAt),
          gt(notes.deletedAt, since)
        )
      );
  } else {
    // Return all notes and folders in workspace (exclude soft-deleted notes)
    noteRows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.workspaceId, workspaceIdValue), isNull(notes.deletedAt)));

    folderRows = await db
      .select()
      .from(folders)
      .where(eq(folders.workspaceId, workspaceIdValue));

    // Return all deleted notes in workspace
    deletedNoteRows = await db
      .select({ publicId: notes.publicId, deletedAt: notes.deletedAt })
      .from(notes)
      .where(
        and(
          eq(notes.workspaceId, workspaceIdValue),
          isNotNull(notes.deletedAt)
        )
      );
  }

  // Build folder paths for each note
  const remoteNotes: RemoteNote[] = await Promise.all(
    noteRows.map(async (note) => {
      const folderPath = await buildFolderPath(note.folderId, workspaceIdValue, db);
      return {
        id: note.id,
        publicId: note.publicId,
        name: note.name,
        title: note.title,
        content: note.content,
        folderId: note.folderId,
        folderPath,
        updatedAt: new Date(note.updatedAt).toISOString(),
      };
    })
  );

  // Build folder paths for each folder
  const remoteFolders: RemoteFolder[] = await Promise.all(
    folderRows.map(async (folder) => {
      const parentFolderPath = await buildFolderPath(folder.parentId, workspaceIdValue, db);
      const folderPath = parentFolderPath ? `${parentFolderPath}/${folder.name}` : folder.name;

      // Check if folder is empty (has no non-deleted notes)
      const notesInFolder = await db
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.folderId, folder.id),
            isNull(notes.deletedAt)
          )
        )
        .limit(1);

      return {
        id: folder.id,
        publicId: folder.publicId,
        name: folder.name,
        displayName: folder.displayName,
        parentId: folder.parentId,
        folderPath,
        updatedAt: new Date(folder.updatedAt).toISOString(),
        isEmpty: notesInFolder.length === 0,
      };
    })
  );

  // Build deleted notes list
  const deletedNotes = deletedNoteRows
    .filter((note) => note.deletedAt !== null)
    .map((note) => ({
      publicId: note.publicId,
      deletedAt: new Date(note.deletedAt!).toISOString(),
    }));

  const response = {
    notes: remoteNotes,
    deleted: deletedNotes,
    folders: remoteFolders,
    syncTimestamp: new Date().toISOString(),
  };

  return c.json(response, 200);
});

export { pullApp };
