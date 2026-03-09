/**
 * Type definitions for the sync feature
 * @packageDocumentation
 */

/**
 * Sync configuration stored in .sync/config.json
 */
export interface SyncConfig {
  /** Workspace slug being synced */
  workspaceSlug: string;
  /** Profile alias used for authentication */
  alias: string;
  /** Server URL */
  serverUrl: string;
  /** Sync mode */
  syncMode: "auto" | "manual";
  /** Conflict resolution strategy */
  conflictStrategy: "newer-wins" | "local-wins" | "remote-wins";
  /** Timestamp when sync was initialized */
  initializedAt: string; // ISO 8601
  /** Daemon process ID (null if not running) */
  daemonPid: number | null;
  /** Sync directory path (relative to project root) */
  syncDir: string; // ".kontexted"
}

/**
 * File sync state stored in .sync/state.json
 */
export interface SyncState {
  /** Per-file sync state */
  files: Record<string, FileSyncState>;
  /** Per-folder sync state */
  folders: Record<string, FolderSyncState>;
  /** Last full sync timestamp */
  lastFullSync: string | null; // ISO 8601
  /** Sync version (for future migrations) */
  version: number;
}

/**
 * State for a single file
 */
export interface FileSyncState {
  /** Content hash (SHA-256) of local file */
  localHash: string | null;
  /** Content hash (SHA-256) of remote note */
  remoteHash: string | null;
  /** Local file modification time */
  localMtime: string | null; // ISO 8601
  /** Remote note updatedAt timestamp */
  remoteMtime: string | null; // ISO 8601
  /** Last successful sync timestamp */
  lastSync: string | null; // ISO 8601
  /** Remote note publicId */
  publicId: string;
  /** Remote note internal id */
  noteId: number;
  /** Folder path (relative to .kontexted/) */
  folderPath: string | null;
}

/**
 * State for a single folder
 */
export interface FolderSyncState {
  /** Local folder modification time */
  localMtime: string | null;
  /** Remote folder updatedAt timestamp */
  remoteMtime: string | null;
  /** Last successful sync timestamp */
  lastSync: string | null;
  /** Remote folder publicId */
  publicId: string;
  /** Remote folder internal id */
  folderId: number;
  /** Folder path (relative to sync directory) */
  folderPath: string;
}

/**
 * Pending change in the queue (SQLite)
 */
export interface PendingChange {
  id: number;
  /** Relative file path */
  filePath: string;
  /** Change type */
  type: "create" | "update" | "delete";
  /** Content (null for delete) */
  content: string | null;
  /** When the change was detected */
  detectedAt: string; // ISO 8601
  /** Number of retry attempts */
  retryCount: number;
  /** Last error message (if any) */
  lastError: string | null;
}

/**
 * Conflict log entry
 */
export interface ConflictLogEntry {
  timestamp: string; // ISO 8601
  filePath: string;
  winner: "local" | "remote";
  loserPath: string; // Path to preserved shadow copy
  localMtime: string;
  remoteMtime: string;
}

/**
 * Remote note representation for sync
 */
export interface RemoteNote {
  id: number;
  publicId: string;
  name: string;
  title: string;
  content: string;
  folderId: number | null;
  folderPath: string | null;
  updatedAt: string; // ISO 8601
}

/**
 * Sync status response
 */
export interface SyncStatus {
  status: "running" | "stopped" | "paused" | "error";
  workspaceSlug: string;
  filesSynced: number;
  pendingChanges: number;
  conflicts: number;
  lastSync: string | null;
  uptime: number | null; // seconds
  error: string | null;
}

/**
 * File change event from watcher
 */
export interface FileChangeEvent {
  /** Type of change detected */
  type: "create" | "update" | "delete";
  /** Absolute file path */
  filePath: string;
  /** Relative path from sync directory */
  relativePath: string;
}

/**
 * Folder change event from watcher
 */
export interface FolderChangeEvent {
  /** Type of change detected */
  type: "create" | "delete";
  /** Relative folder path */
  folderPath: string;
  /** Absolute folder path */
  absolutePath: string;
}

/**
 * Remote change event from SSE
 */
export interface RemoteChangeEvent {
  /** Type of remote change */
  type: "create" | "update" | "delete";
  /** The remote note (for create/update) */
  note?: RemoteNote;
  /** The public ID of the note (for delete) */
  publicId?: string;
}

/**
 * Remote folder change event from SSE
 */
export interface RemoteFolderChangeEvent {
  /** Type of remote folder change */
  type: "folder.create" | "folder.delete" | "folder.update";
  /** The remote folder (for create/update) */
  folder?: RemoteFolder;
  /** The public ID of the folder (for delete) */
  publicId?: string;
}

// ============================================
// API Types
// ============================================

/**
 * Deleted note information from pull response
 */
export interface DeletedNoteInfo {
  /** Public ID of the deleted note */
  publicId: string;
  /** When the note was deleted */
  deletedAt: string; // ISO 8601
}

/**
 * Remote folder representation
 */
export interface RemoteFolder {
  /** Internal folder ID */
  id: number;
  /** Public folder ID */
  publicId: string;
  /** Folder name (slug) */
  name: string;
  /** Display name */
  displayName: string;
  /** Parent folder ID */
  parentId: number | null;
  /** Folder path (relative to workspace root) */
  folderPath: string;
  /** Last update timestamp */
  updatedAt: string; // ISO 8601
  /** Whether the folder is empty */
  isEmpty?: boolean;
}

/**
 * Response from /api/sync/pull
 */
export interface SyncPullResponse {
  /** Notes that have been created or updated since the requested timestamp */
  notes: RemoteNote[];
  /** Notes that have been deleted since the requested timestamp */
  deleted: DeletedNoteInfo[];
  /** Folders that have been created or updated */
  folders: RemoteFolder[];
  /** Server timestamp for the next sync request */
  syncTimestamp: string; // ISO 8601
}

/**
 * Individual change in push request
 */
export type SyncPushChange =
  | SyncPushChangeCreate
  | SyncPushChangeUpdate
  | SyncPushChangeDelete
  | SyncPushChangeFolderCreate
  | SyncPushChangeFolderDelete;

/**
 * Create change payload
 */
export interface SyncPushChangeCreate {
  /** Change type */
  type: "create";
  /** Note name (slug) */
  name: string;
  /** Note title */
  title: string;
  /** Note content (Markdown) */
  content: string;
  /** Target folder path */
  folderPath: string | null;
}

/**
 * Update change payload
 */
export interface SyncPushChangeUpdate {
  /** Change type */
  type: "update";
  /** Public ID of the note to update */
  publicId: string;
  /** Note name (slug) */
  name: string;
  /** Note title */
  title: string;
  /** Note content (Markdown) */
  content: string;
  /** Target folder path */
  folderPath: string | null;
  /** Expected last modification time for conflict detection */
  expectedMtime: string; // ISO 8601
}

/**
 * Delete change payload
 */
export interface SyncPushChangeDelete {
  /** Change type */
  type: "delete";
  /** Public ID of the note to delete */
  publicId: string;
}

/**
 * Folder create change payload
 */
export interface SyncPushChangeFolderCreate {
  /** Change type */
  type: "folder.create";
  /** Folder name (slug) */
  name: string;
  /** Parent folder path (null for root) */
  parentPath: string | null;
}

/**
 * Folder delete change payload
 */
export interface SyncPushChangeFolderDelete {
  /** Change type */
  type: "folder.delete";
  /** Public ID of the folder to delete */
  publicId: string;
}

/**
 * Request to /api/sync/push
 */
export interface SyncPushRequest {
  /** Workspace slug */
  workspaceSlug: string;
  /** List of changes to push */
  changes: SyncPushChange[];
}

/**
 * Accepted change result
 */
export interface SyncPushAccepted {
  /** Public ID of the note */
  publicId: string;
  /** Status of the operation */
  status: "updated";
}

/**
 * Created note result
 */
export interface SyncPushCreated {
  /** Temporary ID from request (for correlation) */
  tempId: string;
  /** Public ID of the newly created note */
  publicId: string;
  /** Status of the operation */
  status: "created";
}

/**
 * Conflict information
 */
export interface SyncPushConflict {
  /** Public ID of the conflicting note */
  publicId: string;
  /** Reason for conflict */
  reason: "remote_modified";
  /** Remote note's last modification time */
  remoteMtime: string; // ISO 8601
  /** Expected modification time sent in request */
  expectedMtime: string; // ISO 8601
}

/**
 * Push error information
 */
export interface SyncPushError {
  /** Public ID of the note that failed */
  publicId: string;
  /** Error message */
  error: string;
}

/**
 * Response from /api/sync/push
 */
export interface SyncPushResponse {
  /** Successfully updated notes */
  accepted: SyncPushAccepted[];
  /** Successfully created notes */
  created: SyncPushCreated[];
  /** Conflicts that need resolution */
  conflicts: SyncPushConflict[];
  /** Errors that occurred during processing */
  errors: SyncPushError[];
}
