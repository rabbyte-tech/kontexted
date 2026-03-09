import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import type { ConflictLogEntry, SyncState } from "@/lib/sync/types";

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
    console.error(
      `Expected to find '${DEFAULT_SYNC_DIR}/' in current directory or specify --dir option.`
    );
    console.error(`Run 'kontexted sync init' first to initialize sync.`);
    process.exit(1);
  }
}

/**
 * Read and parse conflicts.log to get all conflict entries
 */
async function getConflicts(syncDir: string): Promise<ConflictLogEntry[]> {
  const logPath = path.join(syncDir, ".sync", "conflicts.log");

  try {
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line) as ConflictLogEntry);
  } catch {
    return [];
  }
}

/**
 * Write conflicts back to the log file
 */
async function writeConflicts(
  syncDir: string,
  conflicts: ConflictLogEntry[]
): Promise<void> {
  const logPath = path.join(syncDir, ".sync", "conflicts.log");
  const content = conflicts
    .map((entry) => JSON.stringify(entry))
    .join("\n");
  await fs.writeFile(logPath, content, "utf-8");
}

/**
 * Load sync state from .sync/state.json
 */
async function loadSyncState(syncDir: string): Promise<SyncState | null> {
  const statePath = path.join(syncDir, ".sync", "state.json");

  try {
    const stateRaw = await fs.readFile(statePath, "utf-8");
    return JSON.parse(stateRaw) as SyncState;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Save sync state to .sync/state.json
 */
async function saveSyncState(syncDir: string, state: SyncState): Promise<void> {
  const statePath = path.join(syncDir, ".sync", "state.json");
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Handler for the sync conflicts resolve command
 */
export async function handler(argv: {
  id: string;
  keep: "local" | "remote";
  dir?: string;
}): Promise<void> {
  const cwd = process.cwd();

  // Find the sync directory
  const syncDir = await findSyncDir(cwd, argv.dir);

  // Parse the conflict ID (1-based index)
  const conflictId = parseInt(argv.id, 10);
  if (isNaN(conflictId) || conflictId < 1) {
    console.error(`Error: Invalid conflict ID: ${argv.id}`);
    process.exit(1);
  }

  // Get conflicts
  const conflicts = await getConflicts(syncDir);

  // Find the conflict by ID (convert to 0-based index)
  const conflictIndex = conflictId - 1;
  if (conflictIndex < 0 || conflictIndex >= conflicts.length) {
    console.error(`Error: Conflict not found: ${argv.id}`);
    console.error(`Total conflicts: ${conflicts.length}`);
    process.exit(1);
  }

  const conflict = conflicts[conflictIndex];

  // Resolve the conflict
  const localFilePath = path.join(syncDir, conflict.filePath);

  if (argv.keep === "local") {
    // Keep local version - already in place, just remove conflict entry
    console.log(`Resolved conflict #${conflictId}: keeping local version`);
    console.log(`  File: ${conflict.filePath}`);
  } else {
    // Keep remote version - copy loser (shadow) to main file
    const loserPath = path.join(syncDir, conflict.loserPath);
    const loserContent = await fs.readFile(loserPath, "utf-8");
    await fs.writeFile(localFilePath, loserContent, "utf-8");
    console.log(`Resolved conflict #${conflictId}: keeping remote version`);
    console.log(`  File: ${conflict.filePath}`);
    console.log(`  Copied from: ${conflict.loserPath}`);
  }

  // Update sync state - mark file as synced with the new hash
  let state = await loadSyncState(syncDir);
  if (state) {
    // Get the new content hash
    const newContent = await fs.readFile(localFilePath, "utf-8");
    const newHash = await hashContent(newContent);

    // Update the file state
    if (state.files[conflict.filePath]) {
      state.files[conflict.filePath].localHash = newHash;
      state.files[conflict.filePath].remoteHash = newHash;
      await saveSyncState(syncDir, state);
      console.log(`  Updated sync state for ${conflict.filePath}`);
    }
  }

  // Remove the conflict from the log
  conflicts.splice(conflictIndex, 1);
  await writeConflicts(syncDir, conflicts);

  console.log(`  Conflict removed from conflicts.log`);
}

/**
 * Simple hash function for content (SHA-256 via crypto)
 */
async function hashContent(content: string): Promise<string> {
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(content).digest("hex");
}

// ============ Yargs Command Module ============

export const command = "resolve";
export const desc = "Manually resolve conflict";

export const builder = () => {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handlerYargs(argv: any): Promise<void> {
  await handler({
    id: argv.id,
    keep: argv.keep as "local" | "remote",
    dir: argv.dir,
  });
}

// ============ Register with Commander ============

/**
 * Register the sync conflicts resolve command.
 */
export function registerConflictsResolveCommand(conflictsCommand: Command): void {
  conflictsCommand
    .command("resolve <id>")
    .description(desc)
    .requiredOption(
      "--keep <local|remote>",
      "Which version to keep: 'local' or 'remote'"
    )
    .option("--dir <directory>", "Sync directory")
    .action(async (id: string, opts) => {
      if (!opts.keep) {
        console.error("Error: --keep option is required");
        console.error("Usage: kontexted sync conflicts resolve <id> --keep <local|remote>");
        process.exit(1);
      }
      if (opts.keep !== "local" && opts.keep !== "remote") {
        console.error("Error: --keep must be 'local' or 'remote'");
        process.exit(1);
      }
      await handlerYargs({
        id,
        keep: opts.keep,
        dir: opts.dir,
      });
    });
}
