import { db } from "@/db";
import { notes, folders, revisions } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveFolderId, resolveNoteId, resolveNote } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";
import { isValidFolderName } from "@/lib/folder-name";
import { pushExternalUpdateToRoom } from "@/collab-ws/checkpoints";

// ============================================================================
// Types
// ============================================================================

export interface CreateFolderParams {
  workspaceSlug: string;
  name: string;
  displayName: string;
  parentPublicId?: string;
}

export interface CreateFolderResult {
  publicId: string;
  name: string;
  displayName: string;
  parentPublicId: string | null;
}

export interface CreateNoteParams {
  workspaceSlug: string;
  name: string;
  title: string;
  folderPublicId?: string;
  content?: string;
}

export interface CreateNoteResult {
  publicId: string;
  name: string;
  title: string;
  folderPublicId: string | null;
  content: string;
}

export interface UpdateNoteContentParams {
  workspaceSlug: string;
  notePublicId: string;
  content: string;
}

export interface UpdateNoteContentResult {
  publicId: string;
  revisionId: number;
  updatedAt: Date;
}

// ============================================================================
// Error Classes
// ============================================================================

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class DuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateError";
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if a folder with the given name already exists in the same parent location.
 */
async function checkDuplicateFolderName(
  workspaceId: number,
  name: string,
  parentId: number | null
): Promise<boolean> {
  const condition = parentId === null
    ? and(eq(folders.workspaceId, workspaceId), eq(folders.name, name), isNull(folders.parentId))
    : and(eq(folders.workspaceId, workspaceId), eq(folders.name, name), eq(folders.parentId, parentId));

  const existing = await db
    .select({ id: folders.id })
    .from(folders)
    .where(condition)
    .limit(1);

  return existing.length > 0;
}

/**
 * Checks if a note with the given name already exists in the same folder.
 */
async function checkDuplicateNoteName(
  workspaceId: number,
  name: string,
  folderId: number | null
): Promise<boolean> {
  const condition = folderId === null
    ? and(eq(notes.workspaceId, workspaceId), eq(notes.name, name), isNull(notes.folderId))
    : and(eq(notes.workspaceId, workspaceId), eq(notes.name, name), eq(notes.folderId, folderId));

  const existing = await db
    .select({ id: notes.id })
    .from(notes)
    .where(condition)
    .limit(1);

  return existing.length > 0;
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Creates a new folder in a workspace.
 */
export async function createFolderInWorkspace(
  params: CreateFolderParams
): Promise<CreateFolderResult> {
  // Validate workspace slug
  const validatedSlug = parseSlug(params.workspaceSlug);
  if (!validatedSlug) {
    throw new ValidationError("Invalid workspace slug");
  }

  // Resolve workspace ID
  const workspaceId = await resolveWorkspaceId(validatedSlug);
  if (!workspaceId) {
    throw new NotFoundError("Workspace not found");
  }

  // Validate folder name
  if (!params.name || !params.name.trim()) {
    throw new ValidationError("Folder name is required");
  }

  const name = params.name.trim();
  if (!isValidFolderName(name)) {
    throw new ValidationError(
      "Folder name must be kebab-case, camelCase, snake_case, or PascalCase"
    );
  }

  // Validate display name
  if (!params.displayName || !params.displayName.trim()) {
    throw new ValidationError("Folder display name is required");
  }

  const displayName = params.displayName.trim();

  // Resolve parent folder ID if provided
  let parentId: number | null = null;
  if (params.parentPublicId) {
    const validatedParentId = parsePublicId(params.parentPublicId);
    if (!validatedParentId) {
      throw new ValidationError("Invalid parent folder ID");
    }

    parentId = await resolveFolderId(validatedParentId);
    if (!parentId) {
      throw new NotFoundError("Parent folder not found");
    }
  }

  // Check for duplicate folder name in same location
  const isDuplicate = await checkDuplicateFolderName(workspaceId, name, parentId);
  if (isDuplicate) {
    throw new DuplicateError("Folder with this name already exists in this location");
  }

  // Insert new folder
  const insertedRows = await db
    .insert(folders)
    .values({
      workspaceId,
      parentId,
      name,
      displayName,
    })
    .returning({
      publicId: folders.publicId,
      name: folders.name,
      displayName: folders.displayName,
      parentId: folders.parentId,
    });

  const folder = insertedRows[0];

  // Get parent folder's publicId if parent exists
  let parentPublicId: string | null = null;
  if (folder.parentId !== null) {
    const parentRows = await db
      .select({ publicId: folders.publicId })
      .from(folders)
      .where(eq(folders.id, folder.parentId))
      .limit(1);
    parentPublicId = parentRows[0]?.publicId ?? null;
  }

  // Publish SSE event
  workspaceEventHub.publish({
    workspaceId,
    type: "folder.created",
    data: folder,
  });

  return {
    publicId: folder.publicId,
    name: folder.name,
    displayName: folder.displayName,
    parentPublicId,
  };
}

/**
 * Creates a new note in a workspace.
 */
export async function createNoteInWorkspace(
  params: CreateNoteParams
): Promise<CreateNoteResult> {
  // Validate workspace slug
  const validatedSlug = parseSlug(params.workspaceSlug);
  if (!validatedSlug) {
    throw new ValidationError("Invalid workspace slug");
  }

  // Resolve workspace ID
  const workspaceId = await resolveWorkspaceId(validatedSlug);
  if (!workspaceId) {
    throw new NotFoundError("Workspace not found");
  }

  // Validate note name
  if (!params.name || !params.name.trim()) {
    throw new ValidationError("Note name is required");
  }

  const name = params.name.trim();
  if (!isValidFolderName(name)) {
    throw new ValidationError(
      "Note name must be kebab-case, camelCase, snake_case, or PascalCase"
    );
  }

  // Validate title
  if (!params.title || !params.title.trim()) {
    throw new ValidationError("Note title is required");
  }

  const title = params.title.trim();

  // Resolve folder ID if provided
  let folderId: number | null = null;
  if (params.folderPublicId) {
    const validatedFolderId = parsePublicId(params.folderPublicId);
    if (!validatedFolderId) {
      throw new ValidationError("Invalid folder ID");
    }

    folderId = await resolveFolderId(validatedFolderId);
    if (!folderId) {
      throw new NotFoundError("Folder not found");
    }
  }

  // Check for duplicate note name in same folder
  const isDuplicate = await checkDuplicateNoteName(workspaceId, name, folderId);
  if (isDuplicate) {
    throw new DuplicateError("Note with this name already exists in this folder");
  }

  // Insert new note
  const content = params.content ?? "";

  const insertedRows = await db
    .insert(notes)
    .values({
      workspaceId,
      folderId,
      name,
      title,
      content,
    })
    .returning({
      publicId: notes.publicId,
      name: notes.name,
      title: notes.title,
      folderId: notes.folderId,
      content: notes.content,
    });

  const note = insertedRows[0];

  // Get folder's publicId if folder exists
  let folderPublicId: string | null = null;
  if (note.folderId !== null) {
    const folderRows = await db
      .select({ publicId: folders.publicId })
      .from(folders)
      .where(eq(folders.id, note.folderId))
      .limit(1);
    folderPublicId = folderRows[0]?.publicId ?? null;
  }

  // Publish SSE event
  workspaceEventHub.publish({
    workspaceId,
    type: "note.created",
    data: note,
  });

  return {
    publicId: note.publicId,
    name: note.name,
    title: note.title,
    folderPublicId,
    content: note.content,
  };
}

/**
 * Updates the content of a note in a workspace.
 * Creates a revision record and publishes an SSE event.
 */
export async function updateNoteContentInWorkspace(
  params: UpdateNoteContentParams
): Promise<UpdateNoteContentResult> {
  // Validate workspace slug
  const validatedSlug = parseSlug(params.workspaceSlug);
  if (!validatedSlug) {
    throw new ValidationError("Invalid workspace slug");
  }

  // Validate note public ID
  const validatedNotePublicId = parsePublicId(params.notePublicId);
  if (!validatedNotePublicId) {
    throw new ValidationError("Invalid note public ID");
  }

  // Resolve workspace ID
  const workspaceId = await resolveWorkspaceId(validatedSlug);
  if (!workspaceId) {
    throw new NotFoundError("Workspace not found");
  }

  // Resolve note and verify it belongs to workspace
  const note = await resolveNote(validatedNotePublicId);
  if (!note) {
    throw new NotFoundError("Note not found");
  }

  if (note.workspaceId !== workspaceId) {
    throw new NotFoundError("Note not found");
  }

  const noteId = note.id;
  const now = new Date();

  // Insert revision record
  // Note: authorUserId is required (notNull), use placeholder for AI-initiated writes
  const revisionRows = await db
    .insert(revisions)
    .values({
      workspaceId,
      noteId,
      authorUserId: "system",
      content: params.content,
      createdAt: now,
    })
    .returning({ id: revisions.id });

  const revision = revisionRows[0];
  const revisionId = revision.id;

  // Update note content and timestamp
  const updatedNoteRows = await db
    .update(notes)
    .set({ content: params.content, updatedAt: now })
    .where(eq(notes.id, noteId))
    .returning({ publicId: notes.publicId, updatedAt: notes.updatedAt });

  const updatedNote = updatedNoteRows[0];

  // Push external update to active Yjs room if any users are connected
  // This syncs MCP/skill updates in real-time to connected users
  const roomName = `${workspaceId}/${params.notePublicId}`;
  try {
    const pushed = await pushExternalUpdateToRoom(roomName, params.content, "system");
    if (pushed) {
      console.log(`[write-ops] Successfully pushed external update to room: ${roomName}`);
    } else {
      console.log(`[write-ops] No active room for external update: ${roomName}`);
    }
  } catch (error) {
    console.warn(`[write-ops] Failed to push external update to room: ${roomName}`, error);
  }

  // Publish SSE event
  workspaceEventHub.publish({
    workspaceId,
    type: "note.updated",
    data: { id: noteId },
  });

  return {
    publicId: updatedNote.publicId,
    revisionId,
    updatedAt: updatedNote.updatedAt,
  };
}
