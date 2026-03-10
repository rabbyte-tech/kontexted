import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "@/lib/config";
import { ApiClient } from "@/lib/api-client";
import { parseMarkdown } from "@/lib/sync/utils";
import { createAuthenticatedClient } from "@/lib/sync/auth-utils";
import {
  DEFAULT_SYNC_DIR,
  findSyncDir,
  loadSyncConfig,
  loadSyncState,
} from "@/lib/sync/command-utils";
import type {
  SyncConfig,
  SyncState,
  SyncPushRequest,
  SyncPushResponse,
  SyncPushChange,
} from "@/lib/sync/types";
import type { Config, Profile } from "@/types";





/**
 * Handler for the sync force-push command
 */
export async function handler(argv: { force?: boolean; dir?: string; alias?: string }): Promise<void> {
  const cwd = process.cwd();

  // Step 1: Find the sync directory
  console.log("Finding sync directory...");
  const syncDir = await findSyncDir(cwd, argv.dir);
  console.log(`Using sync directory: ${syncDir}`);

  // Step 2: Load sync config (includes alias)
  console.log("Loading sync configuration...");
  const syncConfig = await loadSyncConfig(syncDir);

  // Step 3: Authenticate and create API client
  console.log("Validating profile and authenticating...");
  let apiClient: ApiClient;
  let profile: Profile;

  try {
    const auth = await createAuthenticatedClient(syncConfig.alias);
    apiClient = auth.client;
    profile = auth.profile;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\nError: ${error.message}`);
    } else {
      console.error("\nError: Failed to authenticate. Please run 'kontexted login'...");
    }
    process.exit(1);
  }

  // Step 5: Warn about data loss if not forced
  if (!argv.force) {
    console.log("\n⚠️  WARNING: This will overwrite ALL remote notes with local versions.");
    console.log("   Any changes on the server that don't exist locally will be LOST.");
    console.log("");
    const confirmed = await promptConfirmation("Do you want to continue?");
    if (!confirmed) {
      console.log("Aborted.");
      return;
    }
  }

  // Step 6: Load sync state
  let state = await loadSyncState(syncDir);
  if (state === null) {
    state = { files: {}, folders: {}, lastFullSync: null, version: 1 };
  }

  // Step 8: Get all local markdown files
  console.log("Scanning local files...");
  const localFiles = await getMarkdownFiles(syncDir, syncDir);
  console.log(`Found ${localFiles.length} local files.`);

  // Step 9: Build push request
  const changes: SyncPushChange[] = [];

  // Map tempId -> relativePath for tracking created notes
  const tempIdToPath: Map<string, string> = new Map();

  for (const relativePath of localFiles) {
    const fullPath = path.join(syncDir, relativePath);
    const fileName = path.basename(relativePath, ".md");
    const folderPath = path.dirname(relativePath) === "." ? null : path.dirname(relativePath);

    // Read file content
    let content: string;
    try {
      content = await fs.readFile(fullPath, "utf-8");
    } catch {
      console.warn(`Warning: Could not read file: ${relativePath}`);
      continue;
    }

    // Parse frontmatter
    const { title, body } = parseMarkdown(content);
    const noteTitle = title || fileName;

    // Check if we have existing state for this file
    const existingState = state.files[relativePath];

    if (existingState) {
      // Update existing note
      changes.push({
        type: "update",
        publicId: existingState.publicId,
        name: fileName,
        title: noteTitle,
        content: body,
        folderPath,
        expectedMtime: "", // Force push - ignore conflict detection
      });
    } else {
      // Create new note
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      tempIdToPath.set(tempId, relativePath);
      changes.push({
        type: "create",
        tempId,
        name: fileName,
        title: noteTitle,
        content: body,
        folderPath,
      });
    }
  }

  if (changes.length === 0) {
    console.log("No changes to push.");
    return;
  }

  // Step 10: Push to server
  console.log(`Pushing ${changes.length} changes to server...`);

  const request: SyncPushRequest = {
    workspaceSlug: syncConfig.workspaceSlug,
    changes,
  };

  let response: SyncPushResponse;
  try {
    const res = await apiClient.post("/api/sync/push", request);
    if (!res.ok) {
      if (res.status === 401) {
        console.error("\nError: Authentication failed. Please run 'kontexted login' to re-authenticate.");
        process.exit(1);
      }
      const errorText = await res.text();
      console.error(`Error: Push failed: ${res.status} ${errorText}`);
      process.exit(1);
    }
    response = (await res.json()) as SyncPushResponse;
  } catch (error) {
    console.error("\nError: Network error while pushing to server.");
    if (error instanceof Error) {
      console.error(`Details: ${error.message}`);
    }
    process.exit(1);
  }

  // Step 11: Process response and update state
  console.log(`\nResults:`);
  console.log(`  Created: ${response.created?.length || 0}`);
  console.log(`  Updated: ${response.accepted?.length || 0}`);
  console.log(`  Conflicts: ${response.conflicts?.length || 0}`);
  console.log(`  Errors: ${response.errors?.length || 0}`);

  // Log any errors
  if (response.errors && response.errors.length > 0) {
    console.log("\nErrors:");
    for (const err of response.errors) {
      console.log(`  - ${err.publicId}: ${err.error}`);
    }
  }

  // Log any conflicts (these are expected in force-push as we ignore expectedMtime)
  if (response.conflicts && response.conflicts.length > 0) {
    console.log("\nConflicts (remote was modified, but overwritten):");
    for (const conflict of response.conflicts) {
      console.log(`  - ${conflict.publicId}`);
    }
  }

  // Update state with new publicIds for created notes
  if (response.created && response.created.length > 0) {
    // We need to fetch note details to get noteId
    // For now, update with publicId and set noteId to 0 (will be corrected on next pull)
    for (const created of response.created) {
      const relativePath = tempIdToPath.get(created.tempId);
      if (relativePath) {
        state.files[relativePath] = {
          localHash: null,
          remoteHash: null,
          localMtime: null,
          remoteMtime: null,
          lastSync: new Date().toISOString(),
          publicId: created.publicId,
          noteId: 0, // Will be updated on next sync
          folderPath: null, // Will be updated on next sync
        };
      }
    }
    console.log(`Updated state for ${response.created.length} newly created notes.`);
  }

  // Update last full sync timestamp
  state.lastFullSync = new Date().toISOString();

  // Save state
  const statePath = path.join(syncDir, ".sync", "state.json");
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");

  console.log("\nForce push complete. Remote updated.");
}

/**
 * Prompt user for confirmation
 */
async function promptConfirmation(message: string): Promise<boolean> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

/**
 * Recursively get all markdown files in a directory
 */
async function getMarkdownFiles(dir: string, baseDir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    // Skip .sync directory
    if (relativePath.startsWith(".sync")) {
      continue;
    }

    if (entry.isDirectory()) {
      const subFiles = await getMarkdownFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relativePath);
    }
  }

  return files;
}

// ============ Yargs Command Module ============

export const command = "force-push";
export const desc = "Overwrite remote with local versions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs
    .option("force", {
      alias: "f",
      type: "boolean",
      description: "Force overwrite without confirmation",
      default: false,
    })
    .option("dir", {
      type: "string",
      description: "Sync directory (default: .kontexted in current directory)",
    })
    .option("alias", {
      type: "string",
      description: "Profile alias to use",
    });
};

export async function handlerYargs(argv: {
  force?: boolean;
  dir?: string;
  alias?: string;
}): Promise<void> {
  await handler({
    force: argv.force,
    dir: argv.dir,
    alias: argv.alias,
  });
}

// ============ Register with Commander ============

/**
 * Register the sync force-push command with the sync command.
 */
export function registerForcePushCommand(syncCommand: Command): void {
  syncCommand
    .command("force-push")
    .description(desc)
    .option("-f, --force", "Force overwrite without confirmation")
    .option("--dir <directory>", "Sync directory (default: .kontexted in current directory)")
    .option("--alias <alias>", "Profile alias to use")
    .action(async (opts) => {
      await handlerYargs({
        force: opts.force,
        dir: opts.dir,
        alias: opts.alias,
      });
    });
}
