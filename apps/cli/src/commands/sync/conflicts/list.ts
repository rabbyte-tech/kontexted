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
 * Display conflicts in human-readable format
 */
function displayConflicts(conflicts: ConflictLogEntry[]): void {
  if (conflicts.length === 0) {
    console.log("No conflicts found.");
    return;
  }

  console.log("Conflicts:");
  for (let i = 0; i < conflicts.length; i++) {
    const conflict = conflicts[i];
    const winnerText =
      conflict.winner === "local" ? "local wins" : "remote wins";
    const timestamp = formatTimestamp(conflict.timestamp);
    console.log(`  ${i + 1}. ${conflict.filePath} (${winnerText}, ${timestamp})`);
  }
}

/**
 * Display conflicts in JSON format
 */
function displayConflictsJson(conflicts: ConflictLogEntry[]): void {
  const output = conflicts.map((conflict, index) => ({
    id: index + 1,
    filePath: conflict.filePath,
    winner: conflict.winner,
    timestamp: conflict.timestamp,
    localMtime: conflict.localMtime,
    remoteMtime: conflict.remoteMtime,
  }));

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Handler for the sync conflicts list command
 */
export async function handler(argv: {
  json?: boolean;
  dir?: string;
}): Promise<void> {
  const cwd = process.cwd();

  // Find the sync directory
  const syncDir = await findSyncDir(cwd, argv.dir);

  // Get conflicts
  const conflicts = await getConflicts(syncDir);

  // Display output
  if (argv.json) {
    displayConflictsJson(conflicts);
  } else {
    displayConflicts(conflicts);
  }
}

// ============ Yargs Command Module ============

export const command = "list";
export const desc = "List unresolved conflicts";

export const builder = () => {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handlerYargs(argv: any): Promise<void> {
  await handler({
    json: argv.json,
    dir: argv.dir,
  });
}

// ============ Register with Commander ============

/**
 * Register the sync conflicts list command.
 */
export function registerConflictsListCommand(conflictsCommand: Command): void {
  conflictsCommand
    .command("list")
    .description(desc)
    .option("--dir <directory>", "Sync directory")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      await handlerYargs({
        json: opts.json,
        dir: opts.dir,
      });
    });
}
