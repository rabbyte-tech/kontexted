import type { Command } from "commander";
import { Database } from "bun:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import type { SyncConfig, SyncState, ConflictLogEntry } from "@/lib/sync/types";
import {
  DEFAULT_SYNC_DIR,
  findSyncDir,
  loadSyncConfig,
  loadSyncState,
  isDaemonRunning,
  isPaused,
} from "@/lib/sync/command-utils";



/**
 * Count pending changes in the queue database
 */
function countPendingChanges(syncDir: string): number {
  const queuePath = path.join(syncDir, ".sync", "queue.db");

  try {
    const db = new Database(queuePath, { readonly: true });
    const result = db.query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM pending_changes"
    ).get();
    db.close();
    return result?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Read and parse conflicts.log to count unresolved conflicts
 * Returns array of conflict entries with their file paths
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
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(isoString: string | null): string {
  if (!isoString) {
    return "Never";
  }
  const date = new Date(isoString);
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

/**
 * Collect sync status information
 */
async function collectStatus(
  syncDir: string,
  config: SyncConfig,
  state: SyncState | null
): Promise<{
  status: "running" | "stopped" | "paused" | "error";
  workspaceSlug: string;
  serverUrl: string;
  filesSynced: number;
  pendingChanges: number;
  conflicts: ConflictLogEntry[];
  lastSync: string | null;
  uptime: number | null;
  error: string | null;
}> {
  const isRunning = isDaemonRunning(config.daemonPid);
  const paused = await isPaused(syncDir);

  // Determine status: stopped if not running, paused if running but paused, otherwise running
  let status: "running" | "stopped" | "paused" | "error";
  if (!isRunning) {
    status = "stopped";
  } else if (paused) {
    status = "paused";
  } else {
    status = "running";
  }

  // Count synced files from state
  const filesSynced = state?.files ? Object.keys(state.files).length : 0;

  // Count pending changes
  const pendingChanges = countPendingChanges(syncDir);

  // Get conflicts
  const conflicts = await getConflicts(syncDir);

  // Calculate uptime (only when actively running, not when paused)
  let uptime: number | null = null;
  if (status === "running" && config.initializedAt) {
    const startTime = new Date(config.initializedAt).getTime();
    const now = Date.now();
    uptime = Math.floor((now - startTime) / 1000);
  }

  // Last sync from state
  const lastSync = state?.lastFullSync ?? null;

  return {
    status,
    workspaceSlug: config.workspaceSlug,
    serverUrl: config.serverUrl,
    filesSynced,
    pendingChanges,
    conflicts,
    lastSync,
    uptime,
    error: null,
  };
}

/**
 * Display status in human-readable format
 */
function displayStatus(status: Awaited<ReturnType<typeof collectStatus>>): void {
  console.log(`Sync Status: ${status.status}`);
  console.log(`Workspace: ${status.workspaceSlug}`);
  console.log(`Server: ${status.serverUrl}`);
  console.log();
  console.log(`Files: ${status.filesSynced} synced`);
  console.log(`Pending: ${status.pendingChanges} changes`);
  console.log(`Conflicts: ${status.conflicts.length} unresolved`);
  console.log();
  console.log(`Last sync: ${formatTimestamp(status.lastSync)}`);

  if (status.uptime !== null) {
    console.log(`Uptime: ${formatUptime(status.uptime)}`);
  }

  // Display unresolved conflicts if any
  if (status.conflicts.length > 0) {
    console.log();
    console.log("Unresolved conflicts:");
    for (let i = 0; i < status.conflicts.length; i++) {
      const conflict = status.conflicts[i];
      const winnerText = conflict.winner === "local" ? "local version preserved" : "remote version preserved";
      console.log(`  ${i + 1}. ${conflict.filePath} (${winnerText})`);
    }
  }
}

/**
 * Display status in JSON format
 */
function displayStatusJson(status: Awaited<ReturnType<typeof collectStatus>>): void {
  const output = {
    status: status.status,
    workspaceSlug: status.workspaceSlug,
    filesSynced: status.filesSynced,
    pendingChanges: status.pendingChanges,
    conflicts: status.conflicts.length,
    lastSync: status.lastSync,
    uptime: status.uptime,
    error: status.error,
  };

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Handler for the sync status command
 */
export async function handler(argv: { json?: boolean; dir?: string }): Promise<void> {
  const cwd = process.cwd();

  // Find the sync directory
  const syncDir = await findSyncDir(cwd, argv.dir);

  // Load sync configuration
  const config = await loadSyncConfig(syncDir);

  // Load sync state (may not exist)
  const state = await loadSyncState(syncDir);

  // Collect status information
  const status = await collectStatus(syncDir, config, state);

  // Display output
  if (argv.json) {
    displayStatusJson(status);
  } else {
    displayStatus(status);
  }
}

// ============ Yargs Command Module ============

export const command = "status";
export const desc = "Show sync status";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs
    .option("json", {
      alias: "j",
      type: "boolean",
      description: "Output status as JSON",
      default: false,
    })
    .option("dir", {
      type: "string",
      description: "Sync directory (default: .kontexted in current directory)",
    });
};

export async function handlerYargs(argv: {
  json?: boolean;
  dir?: string;
}): Promise<void> {
  await handler({
    json: argv.json,
    dir: argv.dir,
  });
}

// ============ Register with Commander ============

/**
 * Register the sync status command with the sync command.
 */
export function registerStatusCommand(syncCommand: Command): void {
  syncCommand
    .command("status")
    .description(desc)
    .option("-j, --json", "Output status as JSON")
    .option("--dir <directory>", "Sync directory (default: .kontexted in current directory)")
    .action(async (opts) => {
      await handlerYargs({
        json: opts.json,
        dir: opts.dir,
      });
    });
}
