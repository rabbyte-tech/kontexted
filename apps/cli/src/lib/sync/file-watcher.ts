import chokidar, { type FSWatcher } from "chokidar";
import type { FileChangeEvent, FolderChangeEvent } from "./types";

/**
 * File system watcher for sync directory
 * Uses chokidar to detect file changes with debouncing
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private debounceMap = new Map<string, ReturnType<typeof setTimeout>>();
  private debounceMs = 500;

  constructor(
    private syncDir: string,
    private onChange: (event: FileChangeEvent) => void,
    private onFolderChange: (event: FolderChangeEvent) => void
  ) {}

  /**
   * Start watching the sync directory
   */
  start(): void {
    console.log(`[FileWatcher] Starting to watch: ${this.syncDir}`);
    this.watcher = chokidar.watch(this.syncDir, {
      ignored: (path: string) => {
        // Get the relative path from the sync directory
        const relativePath = path.replace(this.syncDir, "").replace(/^\//, "");

        // Ignore empty path (the sync dir itself is passed to ignored check)
        if (!relativePath) return false;

        // Ignore .sync directory and everything inside it
        if (relativePath === ".sync" || relativePath.startsWith(".sync/")) {
          return true;
        }

        // Ignore hidden files/folders inside subdirectories
        // e.g., "folder/.DS_Store" or "folder/.hidden/note.md"
        // But NOT the sync directory name itself (handled above)
        if (relativePath.includes("/.") || relativePath.includes("\\.")) {
          return true;
        }

        return false;
      },
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    this.watcher
      .on("add", (path) => this.handleChange("create", path))
      .on("change", (path) => this.handleChange("update", path))
      .on("unlink", (path) => this.handleChange("delete", path))
      .on("addDir", (path) => {
        console.log(`[FileWatcher] Directory created: ${path}`);
        this.handleFolderChange("create", path);
      })
      .on("unlinkDir", (path) => {
        console.log(`[FileWatcher] Directory removed: ${path}`);
        this.handleFolderChange("delete", path);
      })
      .on("error", (error) => {
        console.error(`[FileWatcher] Error:`, error);
      });
  }

  /**
   * Handle file change with debouncing
   */
  private handleChange(type: "create" | "update" | "delete", filePath: string): void {
    console.log(`[FileWatcher] Detected ${type}: ${filePath}`);
    // Debounce rapid changes
    const existing = this.debounceMap.get(filePath);
    if (existing) clearTimeout(existing);

    this.debounceMap.set(
      filePath,
      setTimeout(() => {
        this.debounceMap.delete(filePath);
        this.onChange({
          type,
          filePath,
          relativePath: filePath.replace(this.syncDir, "").replace(/^\//, "")
        });
      }, this.debounceMs)
    );
  }

  /**
   * Handle folder change with debouncing
   */
  private handleFolderChange(type: "create" | "delete", folderPath: string): void {
    console.log(`[FileWatcher] Detected folder ${type}: ${folderPath}`);
    
    // Get relative path
    const relativePath = folderPath.replace(this.syncDir, "").replace(/^\//, "");
    
    // Skip if it's the root sync directory itself
    if (!relativePath) return;
    
    // Debounce using a different key prefix to avoid collision with file events
    const key = `folder:${relativePath}`;
    const existing = this.debounceMap.get(key);
    if (existing) clearTimeout(existing);

    this.debounceMap.set(
      key,
      setTimeout(() => {
        this.debounceMap.delete(key);
        this.onFolderChange({
          type,
          folderPath: relativePath,
          absolutePath: folderPath,
        });
      }, this.debounceMs)
    );
  }

  /**
   * Stop watching and clean up resources
   */
  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    // Clear any pending debounced callbacks
    this.debounceMap.forEach((timeout) => clearTimeout(timeout));
    this.debounceMap.clear();
  }
}
