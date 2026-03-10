import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { ApiClient } from "@/lib/api-client";
import { ensureDirectoryExists, formatMarkdown, computeFilePath } from "@/lib/sync/utils";
import { sha256 } from "@/lib/sync/crypto";
import { createAuthenticatedClient } from "@/lib/sync/auth-utils";
import {
  findSyncDir,
  loadSyncConfig,
  loadSyncState,
  saveSyncState,
} from "@/lib/sync/command-utils";
import type { SyncState, SyncPullResponse } from "@/lib/sync/types";
import type { Profile } from "@/types";



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
 * Handler for the sync force-pull command
 */
export async function handler(argv: { force?: boolean; dir?: string; alias?: string }): Promise<void> {
  const cwd = process.cwd();

  // Step 1: Find the sync directory
  console.log("Finding sync directory...");
  const syncDir = await findSyncDir(cwd, argv.dir);
  console.log(`Using sync directory: ${syncDir}`);

  // Step 2: Load sync config
  console.log("Loading sync configuration...");
  const syncConfig = await loadSyncConfig(syncDir);

  // Step 3: Authenticate and create API client
  const profileAlias = argv.alias || syncConfig.alias;
  console.log(`Validating profile '${profileAlias}' and authenticating...`);
  let apiClient: ApiClient;
  let profile: Profile;

  try {
    const auth = await createAuthenticatedClient(profileAlias);
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

  // Step 4: Warn about data loss if not forced
  if (!argv.force) {
    console.log("\n⚠️  WARNING: This will overwrite ALL local files with remote versions.");
    console.log("   Any local changes that don't exist on the server will be LOST.");
    console.log("");
    const confirmed = await promptConfirmation("Do you want to continue?");
    if (!confirmed) {
      console.log("Aborted.");
      return;
    }
  }

  // Step 6: Fetch all notes from server
  console.log("Fetching remote notes...");
  let response: Response;
  try {
    response = await apiClient.get(
      `/api/sync/pull?workspaceSlug=${encodeURIComponent(syncConfig.workspaceSlug)}`
    );
    if (!response.ok) {
      if (response.status === 401) {
        console.error("\nError: Authentication failed. Please run 'kontexted login' to re-authenticate.");
        process.exit(1);
      }
      const errorText = await response.text();
      console.error(`Error: Failed to fetch notes: ${response.status} ${errorText}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("\nError: Network error while connecting to server.");
    if (error instanceof Error) {
      console.error(`Details: ${error.message}`);
    }
    process.exit(1);
  }

  const pullData = (await response.json()) as SyncPullResponse;
  const remoteNotes = pullData.notes;

  console.log(`Found ${remoteNotes.length} notes on server.`);

  // Step 8: Load current state
  let state = await loadSyncState(syncDir);
  if (state === null) {
    state = { files: {}, folders: {}, lastFullSync: null, version: 1 };
  }

  // Step 9: Write each note to local filesystem
  console.log("Writing local files...");
  let updatedCount = 0;

  for (const note of remoteNotes) {
    const relativePath = computeFilePath(note);
    const fullPath = path.join(syncDir, relativePath);

    // Ensure directory exists
    await ensureDirectoryExists(fullPath);

    // Format content as markdown
    const content = formatMarkdown(note);

    // Write to file
    await fs.writeFile(fullPath, content, "utf-8");

    // Update state
    const localHash = sha256(content);
    state.files[relativePath] = {
      localHash,
      remoteHash: localHash,
      localMtime: new Date().toISOString(),
      remoteMtime: note.updatedAt,
      lastSync: new Date().toISOString(),
      publicId: note.publicId,
      noteId: note.id,
      folderPath: note.folderPath,
    };

    updatedCount++;
  }

  // Step 10: Update last full sync timestamp
  state.lastFullSync = new Date().toISOString();

  // Step 11: Save state
  await saveSyncState(syncDir, state);

  console.log(`\nForce pull complete. ${updatedCount} files updated.`);
}

// ============ Yargs Command Module ============

export const command = "force-pull";
export const desc = "Overwrite local files with remote versions";

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
 * Register the sync force-pull command with the sync command.
 */
export function registerForcePullCommand(syncCommand: Command): void {
  syncCommand
    .command("force-pull")
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
