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
 * Check if sync is currently paused
 */
async function isPaused(syncDir: string): Promise<boolean> {
  const pauseFlagPath = path.join(syncDir, PAUSE_FLAG_FILE);
  try {
    await fs.access(pauseFlagPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handler for the sync resume command
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

  // Step 3: Check if sync is paused
  if (!(await isPaused(syncDir))) {
    console.log("Sync is not paused.");
    return;
  }

  // Step 4: Remove the pause flag file
  const pauseFlagPath = path.join(syncDir, PAUSE_FLAG_FILE);
  await fs.unlink(pauseFlagPath);

  console.log("Sync resumed.");
}

// ============ Yargs Command Module ============

export const command = "resume";
export const desc = "Resume paused sync";

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
 * Register the sync resume command with the sync command.
 */
export function registerResumeCommand(syncCommand: Command): void {
  syncCommand
    .command("resume")
    .description(desc)
    .option("--dir <directory>", "Sync directory (default: .kontexted in current directory)")
    .action(async (opts) => {
      await handlerYargs({
        dir: opts.dir,
      });
    });
}
