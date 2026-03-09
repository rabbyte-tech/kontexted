import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { readConfig, writeConfig } from "@/lib/config";
import { getProfile, profileExists } from "@/lib/profile";
import { ApiClient } from "@/lib/api-client";
import { SyncEngine } from "@/lib/sync/sync-engine";
import type { SyncConfig } from "@/lib/sync/types";
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
 * Load and validate sync config
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
 * Handler for the sync start command
 */
export async function handler(argv: {
  daemon?: boolean;
  foreground?: boolean;
  pollInterval?: number;
  dir?: string;
}): Promise<void> {
  const cwd = process.cwd();
  const pollInterval = argv.pollInterval || 30;

  // For now, daemon mode is not implemented - always run in foreground
  // This can be enhanced later
  const isDaemon = argv.daemon && !argv.foreground;

  if (isDaemon) {
    console.log("Daemon mode is not yet implemented. Running in foreground mode.");
  }

  // Step 1: Find the sync directory
  console.log("Finding sync directory...");
  const syncDir = await findSyncDir(cwd, argv.dir);
  console.log(`Using sync directory: ${syncDir}`);

  // Step 2: Load sync config
  console.log("Loading sync configuration...");
  const syncConfig = await loadSyncConfig(syncDir);

  // Step 3: Validate profile
  console.log("Validating profile...");
  const config = await readConfig();
  const profile = validateProfile(config, syncConfig.alias);

  // Step 4: Create API client
  const apiClient = new ApiClient(
    profile.serverUrl,
    profile.oauth as OAuthState,
    async () => {
      // Update config with refreshed tokens
      const updatedConfig = await readConfig();
      const updatedProfile = getProfile(updatedConfig, syncConfig.alias);
      if (updatedProfile) {
        updatedProfile.oauth = profile.oauth;
        await writeConfig(updatedConfig);
      }
    }
  );

  // Test API connection
  try {
    const response = await apiClient.get(`/api/sync/pull?workspaceSlug=${encodeURIComponent(syncConfig.workspaceSlug)}`);
    if (!response.ok) {
      if (response.status === 401) {
        console.error("\nError: Authentication failed. Please run 'kontexted login' to re-authenticate.");
        process.exit(1);
      }
      const errorText = await response.text();
      console.error(`Error: Failed to connect to sync server: ${response.status} ${errorText}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("\nError: Network error while connecting to sync server.");
    console.error("Please check your internet connection and try again.");
    if (error instanceof Error) {
      console.error(`Details: ${error.message}`);
    }
    process.exit(1);
  }

  // Step 5: Create sync engine
  console.log("Initializing sync engine...");
  const syncEngine = new SyncEngine(syncDir, apiClient);

  // Step 6: Start sync
  console.log("Starting sync...");
  await syncEngine.start();
  console.log("Sync started. Press Ctrl+C to stop.");

  // Handle shutdown signals
  const shutdown = () => {
    console.log("\nStopping sync...");
    syncEngine.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
  if (process.stdin.isTTY) {
    process.stdin.resume();
  }
}

// ============ Yargs Command Module ============

export const command = "start";
export const desc = "Start sync daemon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs
    .option("daemon", {
      alias: "d",
      type: "boolean",
      description: "Run sync daemon in background (not yet implemented)",
      default: false,
    })
    .option("foreground", {
      alias: "f",
      type: "boolean",
      description: "Run sync daemon in foreground (blocking)",
      default: true,
    })
    .option("poll-interval", {
      type: "number",
      description: "Polling interval for remote changes in seconds (not yet implemented)",
      default: 30,
    })
    .option("dir", {
      type: "string",
      description: "Sync directory (default: .kontexted in current directory)",
    });
};

export async function handlerYargs(argv: {
  daemon?: boolean;
  foreground?: boolean;
  pollInterval?: number;
  dir?: string;
}): Promise<void> {
  await handler({
    daemon: argv.daemon,
    foreground: argv.foreground,
    pollInterval: argv.pollInterval,
    dir: argv.dir,
  });
}

// ============ Register with Commander ============

/**
 * Register the sync start command with the sync command.
 */
export function registerStartCommand(syncCommand: Command): void {
  syncCommand
    .command("start")
    .description(desc)
    .option("-d, --daemon", "Run sync daemon in background (not yet implemented)", false)
    .option("-f, --foreground", "Run sync daemon in foreground (blocking)", true)
    .option("--poll-interval <seconds>", "Polling interval for remote changes (not yet implemented)", "30")
    .option("--dir <directory>", "Sync directory (default: .kontexted in current directory)")
    .action(async (opts) => {
      await handlerYargs({
        daemon: opts.daemon,
        foreground: opts.foreground,
        pollInterval: parseInt(opts.pollInterval, 10),
        dir: opts.dir,
      });
    });
}
