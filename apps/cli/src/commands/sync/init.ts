import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import { readConfig, writeConfig } from "@/lib/config";
import { getProfile, profileExists } from "@/lib/profile";
import { ApiClient } from "@/lib/api-client";
import { createAuthenticatedClient } from "@/lib/sync/auth-utils";
import { logDebug } from "@/lib/logger";
import type { SyncConfig, SyncState, FileSyncState, FolderSyncState, RemoteNote, RemoteFolder } from "@/lib/sync/types";
import { sha256 } from "@/lib/sync/crypto";
import { updateGitignore, formatMarkdown, ensureDirectoryExists } from "@/lib/sync/utils";
import Database from "better-sqlite3";

// ============ Types ============

interface NoteSummary {
  publicId: string;
  name: string;
  title: string;
  folderPublicId: string | null;
}

interface FolderNodeWithPublicId {
  publicId: string;
  name: string;
  displayName: string;
  parentPublicId: string | null;
  notes: NoteSummary[];
  children: FolderNodeWithPublicId[];
}

interface WorkspaceTreeResponse {
  workspaceSlug: string;
  workspaceName: string;
  rootNotes: NoteSummary[];
  folders: FolderNodeWithPublicId[];
}

interface SyncPullResponse {
  notes: RemoteNote[];
  deleted: { publicId: string; deletedAt: string }[];
  folders: RemoteFolder[];
  syncTimestamp: string;
}

// ============ Yargs Command Module ============

export const command = "init";
export const desc = "Initialize sync in current directory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs
    .option("alias", {
      alias: "a",
      type: "string",
      description: "Alias for the workspace to sync with",
    })
    .option("workspace", {
      alias: "w",
      type: "string",
      description: "Workspace slug to sync with",
    })
    .option("dir", {
      alias: "d",
      type: "string",
      description: "Directory to sync (default: current directory)",
      default: ".",
    });
};

export const handler = async (argv: { alias?: string; workspace?: string; dir?: string }) => {
  const projectRoot = process.cwd();
  const syncDirName = ".kontexted";
  const syncDir = join(projectRoot, syncDirName);
  const syncSubDir = join(syncDir, ".sync");
  const conflictsDir = join(syncSubDir, "conflicts");
  const queueDbPath = join(syncSubDir, "queue.db");
  const configPath = join(syncSubDir, "config.json");
  const statePath = join(syncSubDir, "state.json");

  // Step 1: Validate alias exists
  const alias = argv.alias;
  if (!alias) {
    console.error("Error: --alias is required");
    process.exit(1);
  }

  let config = await readConfig();

  if (!profileExists(config, alias)) {
    console.error(`Error: Profile alias '${alias}' not found.`);
    console.error("Run 'kontexted login' to add a profile first.");
    process.exit(1);
  }

  let profile = getProfile(config, alias)!;

  // Step 2: Determine workspace
  const workspaceSlug = argv.workspace || profile.workspace;
  if (!workspaceSlug) {
    console.error("Error: No workspace specified and no workspace found in profile.");
    process.exit(1);
  }

  console.log(`Initializing sync for workspace: ${workspaceSlug}`);
  console.log(`Using profile: ${alias}`);

  // Step 3: Check for existing sync directory
  try {
    const existingConfigRaw = await readFile(configPath, "utf-8");
    const existingConfig = JSON.parse(existingConfigRaw) as SyncConfig;

    if (existingConfig.workspaceSlug !== workspaceSlug || existingConfig.alias !== alias) {
      console.log("\nWarning: Directory already has a different sync configuration.");
      console.log(`Existing config: workspace=${existingConfig.workspaceSlug}, alias=${existingConfig.alias}`);
      console.log(`New config: workspace=${workspaceSlug}, alias=${alias}`);

      // For non-interactive CLI, we'll proceed but warn
      console.log("Proceeding with new configuration (will overwrite existing state)...\n");
    }
  } catch {
    // Config doesn't exist, which is fine for init
  }

  // Step 4: Create directories
  console.log("Creating sync directories...");
  await ensureDirectoryExists(syncSubDir);
  await ensureDirectoryExists(conflictsDir);

  // Step 5: Initialize SQLite queue database
  console.log("Initializing queue database...");
  initializeQueueDatabase(queueDbPath);

  // Step 6: Create API client and fetch workspace data
  console.log("Fetching workspace data from server...");

  let apiClient: ApiClient;

  try {
    const auth = await createAuthenticatedClient(alias);
    apiClient = auth.client;
    profile = auth.profile;
    config = auth.config;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\nError: ${error.message}`);
    } else {
      console.error("\nError: Failed to authenticate. Please run 'kontexted login'...");
    }
    process.exit(1);
  }

  let pullResponse: SyncPullResponse;
  try {
    const response = await apiClient.get(`/api/sync/pull?workspaceSlug=${encodeURIComponent(workspaceSlug)}`);

    if (!response.ok) {
      if (response.status === 401) {
        console.error("\nError: Authentication failed. Please run 'kontexted login' to re-authenticate.");
        process.exit(1);
      }
      const errorText = await response.text();
      console.error(`Error: Failed to fetch workspace data: ${response.status} ${errorText}`);
      process.exit(1);
    }

    pullResponse = await response.json() as SyncPullResponse;
  } catch (error) {
    console.error("\nError: Network error while fetching workspace data.");
    console.error("Please check your internet connection and try again.");
    if (error instanceof Error) {
      console.error(`Details: ${error.message}`);
    }
    process.exit(1);
  }

  const { notes, folders } = pullResponse;

  console.log(`Found ${notes.length} notes and ${folders.length} folders.`);

  // Step 7: Download all notes to local directory
  console.log("Downloading notes...");

  const fileStates: Record<string, FileSyncState> = {};

  for (const note of notes) {
    const relativePath = computeNotePath(note);

    // Create directory for the note
    const fullPath = join(syncDir, relativePath);
    await ensureDirectoryExists(fullPath);

    // Format and write markdown content
    const markdownContent = formatMarkdown(note);
    await writeFile(fullPath, markdownContent, "utf-8");

    // Compute hash of the file
    const contentHash = sha256(markdownContent);

    // Record state
    fileStates[relativePath] = {
      localHash: contentHash,
      remoteHash: contentHash,
      localMtime: new Date().toISOString(),
      remoteMtime: note.updatedAt,
      lastSync: new Date().toISOString(),
      publicId: note.publicId,
      noteId: note.id,
      folderPath: note.folderPath || null,
    };

    logDebug(`Synced: ${relativePath}`);
  }

  // Create empty directories
  console.log("Checking for empty directories...");

  const folderStates: Record<string, FolderSyncState> = {};

  // Filter for empty folders and sort by path depth (parents first)
  const emptyFolders = folders
    .filter((folder) => folder.isEmpty === true)
    .sort((a, b) => {
      const depthA = a.folderPath.split("/").length;
      const depthB = b.folderPath.split("/").length;
      return depthA - depthB;
    });

  for (const folder of emptyFolders) {
    const folderFullPath = join(syncDir, folder.folderPath);

    try {
      // Create the directory
      await mkdir(folderFullPath, { recursive: true });
      logDebug(`Created empty directory: ${folder.folderPath}`);

      // Track in sync state
      folderStates[folder.folderPath] = {
        localMtime: new Date().toISOString(),
        remoteMtime: folder.updatedAt,
        lastSync: new Date().toISOString(),
        publicId: folder.publicId,
        folderId: folder.id,
        folderPath: folder.folderPath,
      };
    } catch (error) {
      // Directory might already exist, that's fine
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        console.warn(`Failed to create directory ${folder.folderPath}:`, error);
      }
    }
  }

  // Step 8: Update state.json with initial state
  console.log("Updating sync state...");
  const syncState: SyncState = {
    files: fileStates,
    folders: folderStates,
    lastFullSync: new Date().toISOString(),
    version: 1,
  };
  await writeFile(statePath, JSON.stringify(syncState, null, 2), "utf-8");

  // Step 9: Create config.json
  const syncConfig: SyncConfig = {
    workspaceSlug,
    alias,
    serverUrl: profile.serverUrl,
    syncMode: "auto",
    conflictStrategy: "newer-wins",
    initializedAt: new Date().toISOString(),
    daemonPid: null,
    syncDir: syncDirName,
  };
  await writeFile(configPath, JSON.stringify(syncConfig, null, 2), "utf-8");

  // Step 10: Update .gitignore and .ignore
  console.log("Updating .gitignore and .ignore files...");
  await updateGitignore(syncDirName);

  // Step 11: Print success message
  console.log("\n✓ Sync initialized successfully!");
  console.log(`\nWorkspace: ${workspaceSlug}`);
  console.log(`Notes synced: ${notes.length}`);
  console.log(`Sync directory: ${syncDirName}/`);
  console.log("\nTo start syncing, run:");
  console.log(`  kontexted sync start --dir "${argv.dir || "."}"`);
};

/**
 * Initialize the SQLite queue database with the pending_changes table.
 */
function initializeQueueDatabase(dbPath: string): void {
  // Create database (this will also create the file)
  const db = new Database(dbPath);

  // Create pending_changes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('create', 'update', 'delete')),
      content TEXT,
      detected_at TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      last_error TEXT
    )
  `);

  db.close();
}

/**
 * Compute the relative file path for a note within the sync directory.
 */
function computeNotePath(note: RemoteNote): string {
  const fileName = `${note.name}.md`;
  if (note.folderPath) {
    return join(note.folderPath, fileName);
  }
  return fileName;
}

// ============ Register with Commander ============

/**
 * Register the sync init command with the sync command.
 */
export function registerInitCommand(syncCommand: Command): void {
  syncCommand
    .command("init")
    .description(desc)
    .option("-a, --alias <alias>", "Alias for the workspace to sync with")
    .option("-w, --workspace <slug>", "Workspace slug to sync with")
    .option("-d, --dir <directory>", "Directory to sync (default: current directory)", ".")
    .action(async (opts) => {
      await handler({
        alias: opts.alias,
        workspace: opts.workspace,
        dir: opts.dir,
      });
    });
}
