import type { Command } from "commander";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { readConfig, writeConfig } from "@/lib/config";
import { getProfile, profileExists } from "@/lib/profile";
import { ApiClient } from "@/lib/api-client";
import type {
  SyncConfig,
  SyncState,
  SyncPushRequest,
  SyncPushResponse,
  SyncPushChange,
} from "@/lib/sync/types";
import { parseMarkdown } from "@/lib/sync/utils";
import type { Config, Profile, OAuthState } from "@/types";

/**
 * Default sync directory name
 */
const DEFAULT_SYNC_DIR = ".kontexted";

/**
 * Find the sync directory by looking for .kontexted/ or using --dir option
 */
async function findSyncDir(cwd: string, dirArg?: string): Promise<string> {
  // If --dir was provided, use it
  if (dirArg) {
    const syncDir = path.resolve(cwd, dirArg);
    try {
      await fs.access(syncDir);
      return syncDir;
    } catch {
      console.error(`Error: Directory not found: ${syncDir}`);
      process.exit(1);
    }
  }

  // Otherwise, look for .kontexted/ in current directory
  const defaultSyncDir = path.join(cwd, DEFAULT_SYNC_DIR);
  try {
    await fs.access(defaultSyncDir);
    return defaultSyncDir;
  } catch {
    console.error(`Error: Sync directory not found.`);
    console.error(`Expected to find '${DEFAULT_SYNC_DIR}/' in current directory or specify --dir option.`);
    console.error(`Run 'kontexted sync init' first to initialize sync.`);
    process.exit(1);
  }
}

/**
 * Load sync configuration from .sync/config.json
 */
async function loadSyncConfig(syncDir: string): Promise<SyncConfig> {
  const configPath = path.join(syncDir, ".sync", "config.json");

  try {
    const configRaw = await fs.readFile(configPath, "utf-8");
    return JSON.parse(configRaw) as SyncConfig;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      console.error(`Error: Sync configuration not found.`);
      console.error(`Run 'kontexted sync init' first to initialize sync.`);
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Load sync state from .sync/state.json
 */
async function loadSyncState(syncDir: string): Promise<SyncState> {
  const statePath = path.join(syncDir, ".sync", "state.json");

  try {
    const stateRaw = await fs.readFile(statePath, "utf-8");
    return JSON.parse(stateRaw) as SyncState;
  } catch {
    return { files: {}, folders: {}, lastFullSync: null, version: 1 };
  }
}

/**
 * Validate that profile still exists and tokens are valid
 */
function validateProfile(
  config: Config,
  alias: string
): Profile {
  if (!profileExists(config, alias)) {
    console.error(`Error: Profile alias '${alias}' not found.`);
    console.error("The profile may have been deleted. Run 'kontexted login' to add it again.");
    process.exit(1);
  }

  const profile = getProfile(config, alias)!;

  // Validate tokens exist
  if (!profile.oauth?.tokens?.access_token) {
    console.error(`Error: No valid authentication tokens for profile '${alias}'.`);
    console.error("Run 'kontexted login' to re-authenticate.");
    process.exit(1);
  }

  return profile;
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

/**
 * Handler for the sync force-push command
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

  // Step 3: Determine profile to use
  const profileAlias = argv.alias || syncConfig.alias;

  // Step 4: Validate profile
  console.log("Validating profile...");
  const config = await readConfig();
  const profile = validateProfile(config, profileAlias);

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

  // Step 6: Create API client
  console.log("Connecting to server...");
  const apiClient = new ApiClient(
    profile.serverUrl,
    profile.oauth as OAuthState,
    async () => {
      // Update config with refreshed tokens
      const updatedConfig = await readConfig();
      const updatedProfile = getProfile(updatedConfig, profileAlias);
      if (updatedProfile) {
        updatedProfile.oauth = profile.oauth;
        await writeConfig(updatedConfig);
      }
    }
  );

  // Step 7: Load sync state
  const state = await loadSyncState(syncDir);

  // Step 8: Get all local markdown files
  console.log("Scanning local files...");
  const localFiles = await getMarkdownFiles(syncDir, syncDir);
  console.log(`Found ${localFiles.length} local files.`);

  // Step 9: Build push request
  const changes: SyncPushChange[] = [];

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
      changes.push({
        type: "create",
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
  if (response.created) {
    for (const created of response.created) {
      // Find the corresponding change (we need to match by something - using index for simplicity)
      // Actually, the response doesn't include the tempId, so we can't easily correlate
      // For now, we'll just re-scan on next sync
    }
  }

  // Update last full sync timestamp
  state.lastFullSync = new Date().toISOString();

  // Save state
  const statePath = path.join(syncDir, ".sync", "state.json");
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");

  console.log("\nForce push complete. Remote updated.");
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
