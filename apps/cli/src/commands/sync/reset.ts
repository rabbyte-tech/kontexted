import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_SYNC_DIR,
  SYNC_SUBDIR,
  findSyncDir,
} from "@/lib/sync/command-utils";


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
 * Delete a file if it exists, returns true if deleted, false if didn't exist
 */
async function deleteIfExists(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}


/**
 * Handler for the sync reset command
 */
export async function handler(argv: { clean?: boolean; force?: boolean; dir?: string }): Promise<void> {
  const cwd = process.cwd();

  // Step 1: Find the sync directory
  console.log("Finding sync directory...");
  const syncDir = await findSyncDir(cwd, argv.dir);
  console.log(`Using sync directory: ${syncDir}`);

  if (argv.clean) {
    // ============ Full cleanup mode ============
    console.log("\n⚠️  WARNING: This will delete the entire .kontexted/ directory.");
    console.log("   All local sync data will be lost.");

    // Step 2: Confirm unless --force is passed
    if (!argv.force) {
      const confirmed = await promptConfirmation("Do you want to continue?");
      if (!confirmed) {
        console.log("Aborted.");
        return;
      }
    }

    // Step 3: Delete entire .kontexted/ directory
    console.log("Deleting .kontexted/ directory...");
    await fs.rm(syncDir, { recursive: true, force: true });

    console.log("\nDeleted .kontexted/ directory. Run 'kontexted sync init' to reinitialize.");
  } else {
    // ============ State reset only mode ============
    const syncSubdir = path.join(syncDir, SYNC_SUBDIR);

    // Files to delete for state reset
    const stateFiles = [
      "state.json",
      "queue.db",
      "paused",
      "conflicts.log",
      "daemon.log",
    ];

    console.log("Resetting sync state...");

    // Delete state files (preserve config.json)
    let deletedCount = 0;
    for (const file of stateFiles) {
      const filePath = path.join(syncSubdir, file);
      const deleted = await deleteIfExists(filePath);
      if (deleted) {
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`Deleted ${deletedCount} state file(s).`);
    } else {
      console.log("No state files to delete.");
    }

    console.log("\nReset sync state. Run 'kontexted sync start' to re-sync.");
  }
}


// ============ Yargs Command Module ============

export const command = "reset";
export const desc = "Reset sync state or do full cleanup";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs
    .option("clean", {
      type: "boolean",
      description: "Delete entire .kontexted/ directory (not just state)",
      default: false,
    })
    .option("force", {
      alias: "f",
      type: "boolean",
      description: "Skip confirmation prompt",
      default: false,
    })
    .option("dir", {
      type: "string",
      description: "Sync directory (default: .kontexted in current directory)",
    });
};

export async function handlerYargs(argv: { clean?: boolean; force?: boolean; dir?: string }): Promise<void> {
  await handler({ clean: argv.clean, force: argv.force, dir: argv.dir });
}


// ============ Register with Commander ============

/**
 * Register the sync reset command with the sync command.
 */
export function registerResetCommand(syncCommand: Command): void {
  syncCommand
    .command("reset")
    .description(desc)
    .option("--clean", "Delete entire .kontexted/ directory (not just state)")
    .option("-f, --force", "Skip confirmation prompt")
    .option("--dir <directory>", "Sync directory (default: .kontexted in current directory)")
    .action(async (opts) => {
      await handlerYargs({
        clean: opts.clean,
        force: opts.force,
        dir: opts.dir,
      });
    });
}
