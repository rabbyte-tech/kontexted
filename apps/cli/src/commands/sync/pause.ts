import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import type { SyncConfig } from "@/lib/sync/types";

/**
 * Default sync directory name
 */
const DEFAULT_SYNC_DIR = ".kontexted";

/**
 * Name of the pause flag file
 */
const PAUSE_FLAG_FILE = ".sync/paused";

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
 * Check if daemon is running by verifying the PID
 */
function isDaemonRunning(daemonPid: number | null): boolean {
  if (!daemonPid) {
    return false;
  }

  try {
    // Check if process exists by sending signal 0 (no actual signal sent)
    process.kill(daemonPid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handler for the sync pause command
 */
export async function handler(argv: { dir?: string }): Promise<void> {
  const cwd = process.cwd();

  // Step 1: Find the sync directory
  console.log("Finding sync directory...");
  const syncDir = await findSyncDir(cwd, argv.dir);
  console.log(`Using sync directory: ${syncDir}`);

  // Step 2: Load sync config
  console.log("Loading sync configuration...");
  const config = await loadSyncConfig(syncDir);

  // Step 3: Check if daemon is running
  if (config.daemonPid && isDaemonRunning(config.daemonPid)) {
    console.log(`Sync daemon is running (PID: ${config.daemonPid})`);
  } else {
    console.log("Note: Sync daemon is not currently running.");
    console.log("The pause flag will be set; sync will be paused when daemon starts.");
  }

  // Step 4: Create the pause flag file
  const pauseFlagPath = path.join(syncDir, PAUSE_FLAG_FILE);
  await fs.writeFile(pauseFlagPath, new Date().toISOString(), "utf-8");

  console.log("\nSync paused. Use 'kontexted sync resume' to continue.");
}

// ============ Yargs Command Module ============

export const command = "pause";
export const desc = "Pause sync (keep daemon running)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs.option("dir", {
    type: "string",
    description: "Sync directory (default: .kontexted in current directory)",
  });
};

export async function handlerYargs(argv: { dir?: string }): Promise<void> {
  await handler({ dir: argv.dir });
}

// ============ Register with Commander ============

/**
 * Register the sync pause command with the sync command.
 */
export function registerPauseCommand(syncCommand: Command): void {
  syncCommand
    .command("pause")
    .description(desc)
    .option("--dir <directory>", "Sync directory (default: .kontexted in current directory)")
    .action(async (opts) => {
      await handlerYargs({
        dir: opts.dir,
      });
    });
}
