/**
 * Core sync engine for bidirectional file synchronization
 * @packageDocumentation
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

import type { ApiClient } from "@/lib/api-client";
import { FileWatcher } from "./file-watcher";
import { RemoteListener } from "./remote-listener";
import { Queue } from "./queue";
import type {
  SyncConfig,
  SyncState,
  FileSyncState,
  FileChangeEvent,
  FolderChangeEvent,
  RemoteNote,
  RemoteFolder,
  ConflictLogEntry,
  RemoteChangeEvent,
  RemoteFolderChangeEvent,
  SyncPushRequest,
  SyncPushResponse,
  SyncPullResponse,
} from "./types";
import { sha256 } from "./crypto";
import {
  ensureDirectoryExists,
  parseMarkdown,
  formatMarkdown,
  computeFilePath,
  withRetry,
} from "./utils";

/**
 * Maximum number of retries for failed push operations
 */
const MAX_PUSH_RETRIES = 5;

/**
 * Pause flag file name
 */
const PAUSE_FLAG_FILE = ".sync/paused";

/**
 * SyncEngine coordinates bidirectional sync between local files and remote notes.
 *
 * Key responsibilities:
 * - Watch local file changes and push to server
 * - Handle remote changes from SSE and pull to local
 * - Manage offline queue for network failures
 * - Resolve conflicts using configured strategy
 */
export class SyncEngine {
  private fileWatcher: FileWatcher;
  private remoteListener: RemoteListener;
  private queue: Queue;
  private config: SyncConfig;
  private state: SyncState;
  private running = false;
  private paused = false;

  constructor(
    private syncDir: string,
    private apiClient: ApiClient
  ) {
    this.config = this.loadConfig();
    this.state = this.loadState();
    this.queue = new Queue(path.join(syncDir, ".sync", "queue.db"));

    // Check for pause flag file
    this.paused = this.checkPauseFlag();

    this.fileWatcher = new FileWatcher(
      syncDir,
      this.handleLocalChange.bind(this),
      this.handleLocalFolderChange.bind(this)
    );
    this.remoteListener = new RemoteListener(
      apiClient,
      this.config.workspaceSlug,
      this.handleRemoteChange.bind(this),
      this.handleRemoteFolderChange.bind(this)
    );
  }

  /**
   * Check if pause flag file exists
   */
  private checkPauseFlag(): boolean {
    const pauseFlagPath = path.join(this.syncDir, PAUSE_FLAG_FILE);
    try {
      fsSync.accessSync(pauseFlagPath);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // Lifecycle Methods
  // ============================================

  /**
   * Start the sync engine
   * Performs initial sync first, then starts file watcher
   */
  async start(): Promise<void> {
    this.running = true;

    // Log pause status
    if (this.paused) {
      console.log("Sync is paused - changes will be queued until resumed");
    }

    // Perform initial sync to catch up on changes (only if not paused)
    if (!this.paused) {
      await this.performInitialSync();
    }

    // Process offline queue
    if (!this.paused) {
      await this.processQueue();
    }

    // Start watching
    this.fileWatcher.start();

    // Start listening for remote changes
    await this.remoteListener.start();

    console.log("Sync engine started");
  }

  /**
   * Stop the sync engine
   * Stops file watcher and closes queue database
   */
  stop(): void {
    this.running = false;
    this.fileWatcher.stop();
    this.remoteListener.stop();
    this.queue.close();

    console.log("Sync engine stopped");
  }

  // ============================================
  // Initial Sync Methods
  // ============================================

  /**
   * Perform initial sync to catch up on changes that happened while stopped
   * This runs before file watching starts
   */
  private async performInitialSync(): Promise<void> {
    console.log("[SyncEngine] Performing initial sync...");

    // 1. Pull remote changes since last sync
    await this.pullRemoteChanges();

    // 2. Scan and push local changes
    await this.scanAndPushLocalChanges();

    // 3. Update lastFullSync timestamp
    this.state.lastFullSync = new Date().toISOString();
    this.saveState();

    console.log("[SyncEngine] Initial sync complete");
  }

  /**
   * Pull remote changes that happened since last sync
   */
  private async pullRemoteChanges(): Promise<void> {
    // Determine since timestamp
    const since = this.state.lastFullSync || this.getMostRecentFileSync();

    if (!since) {
      console.log("[SyncEngine] No previous sync found, skipping remote pull");
      return;
    }

    console.log(`[SyncEngine] Pulling remote changes since ${since}`);

    try {
      const response = await this.apiClient.get(
        `/api/sync/pull?workspaceSlug=${this.config.workspaceSlug}&since=${encodeURIComponent(since)}`
      );

      if (!response.ok) {
        console.error("[SyncEngine] Failed to pull remote changes:", response.status);
        return;
      }

      const data = (await response.json()) as SyncPullResponse;

      // Process deleted notes first
      for (const deleted of data.deleted) {
        await this.handleRemoteChange({
          type: "delete",
          publicId: deleted.publicId,
        });
      }

      // Process created/updated notes
      for (const note of data.notes) {
        // Determine if this is a create or update
        const localEntry = Object.entries(this.state.files).find(
          ([_, state]) => state.publicId === note.publicId
        );

        await this.handleRemoteChange({
          type: localEntry ? "update" : "create",
          note,
          publicId: note.publicId,
        });
      }

      // Process folders
      for (const folder of data.folders) {
        const localEntry = Object.entries(this.state.folders).find(
          ([_, state]) => state.publicId === folder.publicId
        );

        await this.handleRemoteFolderChange({
          type: localEntry ? "folder.update" : "folder.create",
          folder,
          publicId: folder.publicId,
        });
      }
    } catch (error) {
      console.error("[SyncEngine] Error pulling remote changes:", error);
    }
  }

  /**
   * Scan local files and push changes that happened while stopped
   */
  private async scanAndPushLocalChanges(): Promise<void> {
    console.log("[SyncEngine] Scanning local files for changes...");

    const files = await this.scanMarkdownFiles(this.syncDir);

    for (const filePath of files) {
      const relativePath = path.relative(this.syncDir, filePath);
      const existingState = this.state.files[relativePath];

      try {
        const content = await fs.readFile(filePath, "utf-8");
        const localHash = sha256(content);

        if (!existingState) {
          // New file created while daemon was stopped
          console.log(`[SyncEngine] Detected new file: ${relativePath}`);
          await this.pushLocalChange({
            type: "create",
            filePath,
            relativePath,
          });
        } else if (localHash !== existingState.localHash) {
          // File modified while daemon was stopped
          console.log(`[SyncEngine] Detected modified file: ${relativePath}`);
          await this.pushLocalChange({
            type: "update",
            filePath,
            relativePath,
          });
        }
      } catch {
        // File might have been deleted, will be handled below
      }
    }

    // Check for deleted files
    for (const [relativePath] of Object.entries(this.state.files)) {
      const fullPath = path.join(this.syncDir, relativePath);

      try {
        await fs.access(fullPath);
      } catch {
        // File was deleted while daemon was stopped
        console.log(`[SyncEngine] Detected deleted file: ${relativePath}`);
        await this.pushLocalChange({
          type: "delete",
          filePath: fullPath,
          relativePath,
        });
      }
    }
  }

  /**
   * Get the most recent file sync timestamp
   */
  private getMostRecentFileSync(): string | null {
    let mostRecent: string | null = null;

    for (const state of Object.values(this.state.files)) {
      if (state.lastSync) {
        if (!mostRecent || new Date(state.lastSync) > new Date(mostRecent)) {
          mostRecent = state.lastSync;
        }
      }
    }

    return mostRecent;
  }

  /**
   * Scan directory for markdown files, excluding .sync directory
   */
  private async scanMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    async function walk(currentDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip .sync directory and hidden files
        if (entry.name === ".sync" || entry.name.startsWith(".")) {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          files.push(fullPath);
        }
      }
    }

    await walk(dir);
    return files;
  }

  /**
   * Pause sync - changes will be queued but not pushed
   */
  pause(): void {
    this.paused = true;
    // Create pause flag file
    const pauseFlagPath = path.join(this.syncDir, PAUSE_FLAG_FILE);
    try {
      fsSync.writeFileSync(pauseFlagPath, new Date().toISOString(), "utf-8");
    } catch {
      // Ignore errors creating the flag file
    }
    console.log("Sync paused");
  }

  /**
   * Resume sync - processes queued changes
   */
  resume(): void {
    this.paused = false;
    // Remove pause flag file
    const pauseFlagPath = path.join(this.syncDir, PAUSE_FLAG_FILE);
    try {
      fsSync.unlinkSync(pauseFlagPath);
    } catch {
      // Ignore errors removing the flag file
    }
    void this.processQueue();
    console.log("Sync resumed");
  }

  // ============================================
  // Local Change Handling
  // ============================================

  /**
   * Handle local file change event from watcher
   */
  private async handleLocalChange(event: FileChangeEvent): Promise<void> {
    console.log(`[SyncEngine] Processing local change: ${event.type} ${event.relativePath}`);

    if (this.paused) {
      console.log(`[SyncEngine] Sync paused, queuing change`);
      this.queueLocalChange(event);
      return;
    }

    try {
      await this.pushLocalChange(event);
      console.log(`[SyncEngine] Successfully pushed change: ${event.relativePath}`);
    } catch (error) {
      console.error(`[SyncEngine] Failed to push change: ${event.relativePath}`, error);
      // Network error - queue for retry
      this.queueLocalChange(event);
      console.error(`Failed to push change, queued: ${event.relativePath}`);
    }
  }

  /**
   * Handle local folder change event from watcher
   */
  private async handleLocalFolderChange(event: FolderChangeEvent): Promise<void> {
    console.log(`[SyncEngine] Processing local folder change: ${event.type} ${event.folderPath}`);

    if (this.paused) {
      console.log(`[SyncEngine] Sync paused, skipping folder change`);
      // Note: We don't queue folder changes, they will be re-detected on resume
      return;
    }

    try {
      if (event.type === "create") {
        await this.pushFolderCreate(event.folderPath);
      } else {
        await this.pushFolderDelete(event.folderPath);
      }
      console.log(`[SyncEngine] Successfully pushed folder change: ${event.folderPath}`);
    } catch (error) {
      console.error(`[SyncEngine] Failed to push folder change: ${event.folderPath}`, error);
    }
  }

  /**
   * Push a folder create operation to the server
   */
  private async pushFolderCreate(folderPath: string): Promise<void> {
    const existingState = this.state.folders[folderPath];

    // Skip if already synced
    if (existingState) {
      console.log(`[SyncEngine] Folder already synced: ${folderPath}`);
      return;
    }

    // Check if folder is empty (has no notes in sync state)
    const hasNotes = this.folderHasNotes(folderPath);
    if (hasNotes) {
      console.log(`[SyncEngine] Folder has notes, skipping empty folder sync: ${folderPath}`);
      return;
    }

    const name = path.basename(folderPath);
    const parentPath = path.dirname(folderPath) === "." ? null : path.dirname(folderPath);

    console.log(`[SyncEngine] Pushing folder create to server: ${folderPath}`);

    const request: SyncPushRequest = {
      workspaceSlug: this.config.workspaceSlug,
      changes: [
        {
          type: "folder.create",
          name,
          parentPath,
        },
      ],
    };

    const response = await withRetry(async () => {
      const res = await this.apiClient.post("/api/sync/push", request);
      if (!res.ok) {
        throw new Error(`Push failed: ${res.status}`);
      }
      return res.json() as Promise<SyncPushResponse>;
    });

    if (response.created?.[0]) {
      const created = response.created[0] as { publicId: string; id?: number };
      this.state.folders[folderPath] = {
        localMtime: new Date().toISOString(),
        remoteMtime: new Date().toISOString(),
        lastSync: new Date().toISOString(),
        publicId: created.publicId,
        folderId: created.id ?? 0,
        folderPath,
      };
      this.saveState();
      console.log(`[SyncEngine] Folder created successfully: ${folderPath} (${created.publicId})`);
    }
  }

  /**
   * Push a folder delete operation to the server
   */
  private async pushFolderDelete(folderPath: string): Promise<void> {
    const existingState = this.state.folders[folderPath];

    if (!existingState) {
      console.log(`[SyncEngine] Folder never synced, skipping delete: ${folderPath}`);
      return;
    }

    console.log(`[SyncEngine] Pushing folder delete to server: ${folderPath} (${existingState.publicId})`);

    const request: SyncPushRequest = {
      workspaceSlug: this.config.workspaceSlug,
      changes: [
        {
          type: "folder.delete",
          publicId: existingState.publicId,
        },
      ],
    };

    await withRetry(async () => {
      const res = await this.apiClient.post("/api/sync/push", request);
      if (!res.ok) {
        throw new Error(`Push failed: ${res.status}`);
      }
      return res.json() as Promise<SyncPushResponse>;
    });

    delete this.state.folders[folderPath];
    this.saveState();
    console.log(`[SyncEngine] Folder deleted successfully: ${folderPath}`);
  }

  /**
   * Check if a folder has notes in sync state
   */
  private folderHasNotes(folderPath: string): boolean {
    for (const filePath of Object.keys(this.state.files)) {
      // Check if file is directly inside this folder
      if (filePath.startsWith(folderPath + "/")) {
        return true;
      }
    }
    return false;
  }

  /**
   * Handle remote folder change from SSE
   */
  private async handleRemoteFolderChange(event: RemoteFolderChangeEvent): Promise<void> {
    console.log(`[SyncEngine] Processing remote folder change: ${event.type}`, event.folder?.publicId || event.publicId);

    if (this.paused) return;

    const { type, folder, publicId } = event;

    if (type === "folder.delete") {
      // Find local folder by publicId
      const localEntry = Object.entries(this.state.folders).find(
        ([_, state]) => state.publicId === publicId
      );

      if (localEntry) {
        const [folderPath] = localEntry;
        const fullPath = path.join(this.syncDir, folderPath);

        // Delete local directory
        try {
          await fs.rm(fullPath, { recursive: true }).catch(() => {});
          console.log(`[SyncEngine] Deleted local folder: ${folderPath}`);
        } catch {
          // Directory might not exist
        }

        delete this.state.folders[folderPath];
        this.saveState();
      }
      return;
    }

    if (!folder) return;

    if (type === "folder.create") {
      // Find local folder by publicId to check if already exists
      const localEntry = Object.entries(this.state.folders).find(
        ([_, state]) => state.publicId === folder.publicId
      );

      if (localEntry) {
        console.log(`[SyncEngine] Folder already exists locally: ${folder.folderPath || folder.name}`);
        return;
      }

      // Create folder path
      const folderPath = folder.folderPath || folder.name;
      const fullPath = path.join(this.syncDir, folderPath);

      try {
        await fs.mkdir(fullPath, { recursive: true });
        console.log(`[SyncEngine] Created local folder: ${folderPath}`);

        this.state.folders[folderPath] = {
          localMtime: new Date().toISOString(),
          remoteMtime: folder.updatedAt,
          lastSync: new Date().toISOString(),
          publicId: folder.publicId,
          folderId: folder.id,
          folderPath,
        };
        this.saveState();
      } catch (error) {
        console.error(`[SyncEngine] Failed to create folder: ${folderPath}`, error);
      }
    }
  }

  /**
   * Queue a local change for later processing
   */
  private queueLocalChange(event: FileChangeEvent): void {
    let content: string | null = null;

    if (event.type !== "delete") {
      try {
        content = fsSync.readFileSync(event.filePath, "utf-8");
      } catch {
        // File might have been deleted
      }
    }

    this.queue.add(event, content);
  }

  /**
   * Push a local change to the server
   */
  private async pushLocalChange(event: FileChangeEvent): Promise<void> {
    const { relativePath, type, filePath } = event;
    const existingState = this.state.files[relativePath];

    if (type === "delete") {
      if (!existingState) return; // Never existed remotely

      await this.pushDelete(existingState.publicId);

      delete this.state.files[relativePath];
      this.saveState();
      return;
    }

    // Create or update
    const content = await fs.readFile(filePath, "utf-8");
    const localHash = sha256(content);

    // Skip if content hasn't changed (e.g., remote write triggered file watcher)
    // This prevents duplicate revisions when we just wrote the file from a remote change
    if (existingState && localHash === existingState.localHash) {
      console.log(`[SyncEngine] Skipping push - content unchanged: ${relativePath}`);
      return;
    }

    const stats = await fs.stat(filePath);
    const localMtime = stats.mtime.toISOString();

    // Parse frontmatter if exists (title, etc.)
    const { title, body } = parseMarkdown(content);
    const name = path.basename(relativePath, ".md");
    const folderPath = path.dirname(relativePath) === "." ? null : path.dirname(relativePath);

    // Create or update - determine the right action based on state existence
    if (existingState) {
      // File has state = treat as update (even if type is "create")
      // This handles: file deleted and recreated with same name
      if (type === "create") {
        console.log(
          `[SyncEngine] Treating create as update (file was deleted and recreated): ${relativePath}`
        );
      }

      // Check for conflict
      const remoteNote = await this.pullNote(existingState.publicId);

      if (remoteNote && this.hasConflict(existingState, remoteNote)) {
        await this.handleConflict(relativePath, existingState, remoteNote, content);
        return;
      }

      await this.pushUpdate({
        publicId: existingState.publicId,
        name,
        title: title || name,
        content: body,
        folderPath: existingState.folderPath,
        expectedMtime: existingState.remoteMtime,
        relativePath,
        localHash,
        localMtime,
      });
    } else {
      // No state = treat as create (even if type is "update")
      // This handles: file created manually outside sync system
      if (type === "update") {
        console.log(
          `[SyncEngine] Treating update as create (file has no sync state): ${relativePath}`
        );
      }

      await this.pushCreate({
        name,
        title: title || name,
        content: body,
        folderPath,
        relativePath,
        localHash,
        localMtime,
      });
    }
  }

  /**
   * Push a delete operation to the server
   */
  private async pushDelete(publicId: string): Promise<void> {
    console.log(`[SyncEngine] Pushing delete to server: ${publicId}`);

    const request: SyncPushRequest = {
      workspaceSlug: this.config.workspaceSlug,
      changes: [
        {
          type: "delete",
          publicId,
        },
      ],
    };

    await withRetry(async () => {
      const response = await this.apiClient.post("/api/sync/push", request);
      if (!response.ok) {
        throw new Error(`Push failed: ${response.status}`);
      }
    });
  }

  /**
   * Push a create operation to the server
   */
  private async pushCreate(params: {
    name: string;
    title: string;
    content: string;
    folderPath: string | null;
    relativePath: string;
    localHash: string;
    localMtime: string;
  }): Promise<void> {
    const { name, title, content, folderPath, relativePath, localHash, localMtime } = params;

    console.log(`[SyncEngine] Pushing create to server: ${relativePath}`);

    const request: SyncPushRequest = {
      workspaceSlug: this.config.workspaceSlug,
      changes: [
        {
          type: "create",
          name,
          title,
          content,
          folderPath,
        },
      ],
    };

    const response = await withRetry(async () => {
      const res = await this.apiClient.post("/api/sync/push", request);
      if (!res.ok) {
        throw new Error(`Push failed: ${res.status}`);
      }
      return res.json() as Promise<SyncPushResponse>;
    });

    if (response.created?.[0]) {
      this.state.files[relativePath] = {
        localHash,
        remoteHash: sha256(content),
        localMtime,
        remoteMtime: new Date().toISOString(),
        lastSync: new Date().toISOString(),
        publicId: response.created[0].publicId,
        noteId: 0, // Will be updated with actual ID from response if available
        folderPath,
      };
      this.saveState();
    }
  }

  /**
   * Push an update operation to the server
   */
  private async pushUpdate(params: {
    publicId: string;
    name: string;
    title: string;
    content: string;
    folderPath: string | null;
    expectedMtime: string | null;
    relativePath: string;
    localHash: string;
    localMtime: string;
  }): Promise<void> {
    const { publicId, name, title, content, folderPath, expectedMtime, relativePath, localHash, localMtime } =
      params;

    console.log(`[SyncEngine] Pushing update to server: ${relativePath} (${publicId})`);

    const request: SyncPushRequest = {
      workspaceSlug: this.config.workspaceSlug,
      changes: [
        {
          type: "update",
          publicId,
          name,
          title,
          content,
          folderPath,
          expectedMtime: expectedMtime || "",
        },
      ],
    };

    const response = await withRetry(async () => {
      const res = await this.apiClient.post("/api/sync/push", request);
      if (!res.ok) {
        throw new Error(`Push failed: ${res.status}`);
      }
      return res.json() as Promise<SyncPushResponse>;
    });

    if (response.accepted?.[0]) {
      const existingState = this.state.files[relativePath];
      this.state.files[relativePath] = {
        ...existingState,
        localHash,
        remoteHash: sha256(content),
        localMtime,
        remoteMtime: new Date().toISOString(),
        lastSync: new Date().toISOString(),
      };
      this.saveState();
    }
  }

  /**
   * Pull a single note from the server
   */
  private async pullNote(publicId: string): Promise<RemoteNote | null> {
    try {
      const response = await this.apiClient.get(
        `/api/sync/pull?workspaceSlug=${this.config.workspaceSlug}&notes=${publicId}`
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { notes: RemoteNote[] };
      return data.notes?.[0] ?? null;
    } catch {
      return null;
    }
  }

  // ============================================
  // Remote Change Handling
  // ============================================

  /**
   * Handle remote change from SSE
   */
  private async handleRemoteChange(event: RemoteChangeEvent): Promise<void> {
    console.log(`[SyncEngine] Processing remote change: ${event.type}`, event.publicId || event.note?.publicId);

    if (this.paused) return;

    const { type, note, publicId } = event;

    // Find local file by publicId
    const localEntry = Object.entries(this.state.files).find(
      ([_, state]) => state.publicId === publicId || (note && state.publicId === note.publicId)
    );

    if (type === "delete") {
      if (localEntry) {
        const [filePath] = localEntry;
        await fs.unlink(path.join(this.syncDir, filePath)).catch(() => {});
        delete this.state.files[filePath];
        this.saveState();
      }
      return;
    }

    if (!note) return;

    // Fetch full note if content is missing (SSE events may not include it)
    let noteToProcess = note;
    if (!note.content && note.publicId) {
      console.log(`[SyncEngine] Fetching full note content for: ${note.publicId}`);
      const fullNote = await this.pullNote(note.publicId);
      if (fullNote) {
        noteToProcess = fullNote;
      }
    }

    const filePath = this.computeFilePath(noteToProcess);
    const fullPath = path.join(this.syncDir, filePath);

    if (type === "create" || !localEntry) {
      // Create new file
      await ensureDirectoryExists(fullPath);
      const content = formatMarkdown(noteToProcess);
      await fs.writeFile(fullPath, content, "utf-8");

      this.state.files[filePath] = {
        localHash: sha256(content),
        remoteHash: sha256(noteToProcess.content),
        localMtime: new Date().toISOString(),
        remoteMtime: noteToProcess.updatedAt,
        lastSync: new Date().toISOString(),
        publicId: noteToProcess.publicId,
        noteId: noteToProcess.id,
        folderPath: noteToProcess.folderPath,
      };
      this.saveState();
    } else if (type === "update") {
      // Check for conflict
      const [existingPath, existingState] = localEntry;

      // Skip if this is our own change echoing back from the server
      // Our lastSync timestamp should be >= the remote updatedAt if we just pushed
      if (existingState.lastSync && noteToProcess.updatedAt) {
        const lastSyncTime = new Date(existingState.lastSync).getTime();
        const remoteTime = new Date(noteToProcess.updatedAt).getTime();
        // Allow 1 second tolerance for clock differences
        if (remoteTime <= lastSyncTime + 1000) {
          console.log(`[SyncEngine] Skipping SSE event - our own change echoing back: ${filePath}`);
          // Still update the remoteMtime to stay in sync
          this.state.files[filePath] = {
            ...existingState,
            remoteMtime: noteToProcess.updatedAt,
          };
          this.saveState();
          return;
        }
      }

      try {
        const localContent = await fs.readFile(fullPath, "utf-8");
        const localHash = sha256(localContent);

        if (localHash !== existingState.localHash) {
          // Local file changed - conflict!
          await this.handleConflict(existingPath, existingState, noteToProcess, localContent);
          return;
        }
      } catch {
        // File doesn't exist locally, just write
      }

      // No conflict, write remote content
      const content = formatMarkdown(noteToProcess);
      await ensureDirectoryExists(fullPath);
      await fs.writeFile(fullPath, content, "utf-8");

      this.state.files[filePath] = {
        localHash: sha256(content),
        remoteHash: sha256(noteToProcess.content),
        localMtime: new Date().toISOString(),
        remoteMtime: noteToProcess.updatedAt,
        lastSync: new Date().toISOString(),
        publicId: noteToProcess.publicId,
        noteId: noteToProcess.id,
        folderPath: noteToProcess.folderPath,
      };
      this.saveState();
    }
  }

  /**
   * Compute file path from remote note
   */
  private computeFilePath(note: RemoteNote): string {
    const folder = note.folderPath ? `${note.folderPath}/` : "";
    return `${folder}${note.name}.md`;
  }

  // ============================================
  // Conflict Resolution
  // ============================================

  /**
   * Check if there's a conflict between local and remote
   */
  private hasConflict(localState: FileSyncState, remoteNote: RemoteNote): boolean {
    // Check if remote was modified after last sync
    if (!localState.lastSync) return false;
    return new Date(remoteNote.updatedAt) > new Date(localState.lastSync);
  }

  /**
   * Handle a conflict between local and remote versions
   */
  private async handleConflict(
    filePath: string,
    localState: FileSyncState,
    remoteNote: RemoteNote,
    localContent: string
  ): Promise<void> {
    const localMtime = new Date(localState.localMtime || Date.now());
    const remoteMtime = new Date(remoteNote.updatedAt);

    let winner: "local" | "remote";
    let winnerContent: string;
    let loserContent: string;

    switch (this.config.conflictStrategy) {
      case "local-wins":
        winner = "local";
        winnerContent = localContent;
        loserContent = formatMarkdown(remoteNote);
        break;
      case "remote-wins":
        winner = "remote";
        winnerContent = formatMarkdown(remoteNote);
        loserContent = localContent;
        break;
      case "newer-wins":
      default:
        winner = localMtime > remoteMtime ? "local" : "remote";
        winnerContent = winner === "local" ? localContent : formatMarkdown(remoteNote);
        loserContent = winner === "local" ? formatMarkdown(remoteNote) : localContent;
    }

    // Write winner to main file
    const fullPath = path.join(this.syncDir, filePath);
    await ensureDirectoryExists(fullPath);
    await fs.writeFile(fullPath, winnerContent, "utf-8");

    // Preserve loser as shadow copy
    const loserPath = this.computeConflictPath(filePath, winner === "local" ? "remote" : "local");
    const fullLoserPath = path.join(this.syncDir, ".sync", "conflicts", loserPath);
    await ensureDirectoryExists(fullLoserPath);
    await fs.writeFile(fullLoserPath, loserContent, "utf-8");

    // Log conflict
    this.logConflict({
      timestamp: new Date().toISOString(),
      filePath,
      winner,
      loserPath: `.sync/conflicts/${loserPath}`,
      localMtime: localMtime.toISOString(),
      remoteMtime: remoteMtime.toISOString(),
    });

    // Update state
    this.state.files[filePath] = {
      ...localState,
      localHash: sha256(winnerContent),
      remoteHash: sha256(winner === "local" ? localContent : remoteNote.content),
      localMtime: new Date().toISOString(),
      remoteMtime: remoteNote.updatedAt,
      lastSync: new Date().toISOString(),
    };
    this.saveState();

    console.log(`Conflict resolved (${winner} wins): ${filePath}`);
  }

  /**
   * Compute the path for a conflict shadow copy
   */
  private computeConflictPath(filePath: string, source: "local" | "remote"): string {
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return path.join(dir, `${base}.${source}-${timestamp}${ext}`);
  }

  /**
   * Log a conflict to the conflicts log file
   */
  private logConflict(entry: ConflictLogEntry): void {
    const logPath = path.join(this.syncDir, ".sync", "conflicts.log");
    const line = JSON.stringify(entry) + "\n";
    void fs.appendFile(logPath, line, "utf-8");
  }

  // ============================================
  // Queue Processing
  // ============================================

  /**
   * Process pending changes from the offline queue
   */
  private async processQueue(): Promise<void> {
    const pendingChanges = this.queue.getAll();

    for (const row of pendingChanges) {
      // Skip if max retries exceeded
      if (row.retryCount >= MAX_PUSH_RETRIES) {
        console.error(`Max retries exceeded for: ${row.filePath}`);
        this.queue.remove(row.id);
        continue;
      }

      try {
        // Reconstruct change event
        const event: FileChangeEvent = {
          type: row.type as "create" | "update" | "delete",
          filePath: path.join(this.syncDir, row.filePath),
          relativePath: row.filePath,
        };

        // Write content back if needed
        if (row.content && row.type !== "delete") {
          await fs.writeFile(event.filePath, row.content, "utf-8");
        }

        await this.pushLocalChange(event);

        // Success - remove from queue
        this.queue.remove(row.id);
      } catch (error) {
        // Update retry count and error
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        this.queue.incrementRetry(row.id, errorMessage);
      }
    }
  }

  // ============================================
  // Configuration & State Management
  // ============================================

  /**
   * Load sync configuration from .sync/config.json
   */
  private loadConfig(): SyncConfig {
    const configPath = path.join(this.syncDir, ".sync", "config.json");
    try {
      const content = fsSync.readFileSync(configPath, "utf-8");
      return JSON.parse(content) as SyncConfig;
    } catch {
      throw new Error(
        `Sync not initialized. Run 'kontexted sync init' first. Config not found at: ${configPath}`
      );
    }
  }

  /**
   * Load sync state from .sync/state.json
   */
  private loadState(): SyncState {
    const statePath = path.join(this.syncDir, ".sync", "state.json");
    try {
      const content = fsSync.readFileSync(statePath, "utf-8");
      const parsed = JSON.parse(content) as SyncState;
      // Ensure folders property exists (for backward compatibility)
      if (!parsed.folders) {
        parsed.folders = {};
      }
      return parsed;
    } catch {
      return { files: {}, folders: {}, lastFullSync: null, version: 1 };
    }
  }

  /**
   * Save sync state to .sync/state.json
   */
  private saveState(): void {
    const statePath = path.join(this.syncDir, ".sync", "state.json");
    fsSync.writeFileSync(statePath, JSON.stringify(this.state, null, 2));
  }

  // ============================================
  // Public Accessors
  // ============================================

  /**
   * Get the current sync status
   */
  getStatus(): { running: boolean; paused: boolean; filesCount: number; queueCount: number } {
    return {
      running: this.running,
      paused: this.paused,
      filesCount: Object.keys(this.state.files).length,
      queueCount: this.queue.getCount(),
    };
  }

  /**
   * Get the sync configuration
   */
  getConfig(): SyncConfig {
    return this.config;
  }

  /**
   * Get the sync state
   */
  getState(): SyncState {
    return this.state;
  }
}
