import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import type { ConflictLogEntry } from "@/lib/sync/types";

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
 * Format timestamp for display
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

/**
 * Handler for the sync conflicts show command
 */
export async function handler(argv: { id: string; dir?: string }): Promise<void> {
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

  // Display conflict header
  console.log(`Conflict #${conflictId}: ${conflict.filePath}`);
  console.log(`Winner: ${conflict.winner}`);
  console.log(`Timestamp: ${formatTimestamp(conflict.timestamp)}`);
  console.log();

  // Read the winner file (local file)
  const localFilePath = path.join(syncDir, conflict.filePath);
  const localContent = await fs.readFile(localFilePath, "utf-8");

  // Read the loser file (shadow copy)
  const loserPath = path.join(syncDir, conflict.loserPath);
  const loserContent = await fs.readFile(loserPath, "utf-8");

  // Display both versions
  const winnerLabel =
    conflict.winner === "local" ? "local version" : "remote version (preserved)";
  const loserLabel =
    conflict.winner === "local"
      ? "remote version (preserved)"
      : "local version (preserved)";

  console.log(`--- ${winnerLabel} ---`);
  console.log(localContent);
  console.log();
  console.log(`--- ${loserLabel} (at ${conflict.loserPath}) ---`);
  console.log(loserContent);
}

// ============ Yargs Command Module ============

export const command = "show";
export const desc = "Show details of a conflict";

export const builder = () => {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handlerYargs(argv: any): Promise<void> {
  await handler({
    id: argv.id,
    dir: argv.dir,
  });
}

// ============ Register with Commander ============

/**
 * Register the sync conflicts show command.
 */
export function registerConflictsShowCommand(conflictsCommand: Command): void {
  conflictsCommand
    .command("show <id>")
    .description(desc)
    .option("--dir <directory>", "Sync directory")
    .action(async (id: string, opts) => {
      await handlerYargs({
        id,
        dir: opts.dir,
      });
    });
}
