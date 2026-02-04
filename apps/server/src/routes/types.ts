import { db } from "@/db";
import { auth } from "@/auth";

/**
 * Type guard to check if a value is a plain object (record)
 * Useful for narrowing unknown request bodies
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Database client type - same as the exported `db` instance
 * This represents either a PostgreSQL or SQLite database client
 */
export type DbClient = typeof db;

/**
 * Session type from better-auth
 * Extracted from the return type of auth.api.getSession
 */
export type Session = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/**
 * Hono context variables type
 * Available in all route handlers via c.get("session") and c.get("db")
 */
export interface Variables {
  session: Session;
  db: DbClient;
}

/**
 * Workspace creation request body
 */
export interface CreateWorkspaceBody {
  name: string;
}

/**
 * Folder creation/update request body
 */
export interface FolderBody {
  name: string;
  displayName: string;
  parentId?: string | null;
}

/**
 * Note creation/update request body
 */
export interface NoteBody {
  name: string;
  title: string;
  folderId?: string | null;
}

/**
 * Note move request body
 */
export interface NoteMoveBody {
  folderId?: string | null;
}

/**
 * Folder move request body
 */
export interface FolderMoveBody {
  parentId?: string | null;
}

/**
 * Note content update request body
 */
export interface NoteContentBody {
  content: string;
  includeBlame?: boolean;
}

/**
 * Upload entry type
 */
export interface UploadEntry {
  name: string;
  title: string;
  content: string;
  folderPath: string | null;
}

/**
 * Upload request body
 */
export interface UploadRequest {
  entries: UploadEntry[];
  targetFolderPublicId: string | null;
}

/**
 * Upload response type
 */
export interface UploadResponse {
  created: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
}
