import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { profileExists, getProfile } from "@/lib/profile";
import type { SyncConfig } from "./types";

/**
 * Centralized utilities for sync command operations
 */

/**
 * Default sync directory name
 */
export const DEFAULT_SYNC_DIR = ".kontexted";

/**
 * Daemon log filename
 */
export const DAEMON_LOG_FILENAME = "daemon.log";

/**
 * Sync subdirectory name
 */
export const SYNC_SUBDIR = ".sync";

/**
 * Find the sync directory by looking for .kontexted/ or using --dir option
 */
export async function findSyncDir(cwd: string, dirArg?: string): Promise<string> {
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
export async function loadSyncConfig(syncDir: string): Promise<import("@/lib/sync/types").SyncConfig> {
  const configPath = path.join(syncDir, ".sync", "config.json");

  try {
    const configRaw = await fs.readFile(configPath, "utf-8");
    return JSON.parse(configRaw) as import("@/lib/sync/types").SyncConfig;
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
export async function loadSyncState(
  syncDir: string
): Promise<import("@/lib/sync/types").SyncState | null> {
  const statePath = path.join(syncDir, ".sync", "state.json");

  try {
    const stateRaw = await fs.readFile(statePath, "utf-8");
    return JSON.parse(stateRaw) as import("@/lib/sync/types").SyncState;
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
export async function saveSyncState(syncDir: string, state: import("@/lib/sync/types").SyncState): Promise<void> {
  const statePath = path.join(syncDir, ".sync", "state.json");
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Check if daemon is running by verifying the PID
 */
export function isDaemonRunning(daemonPid: number | null): boolean {
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
 * Check if sync is currently paused
 */
export async function isPaused(syncDir: string): Promise<boolean> {
  const pauseFlagPath = path.join(syncDir, ".sync", "paused");
  try {
    await fs.access(pauseFlagPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate that profile still exists and tokens are valid
 */
export function validateProfile(
  config: import("@/types").Config,
  alias: string
): import("@/types").Profile {
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
 * Get the path to the daemon log file
 */
export function getDaemonLogPath(syncDir: string): string {
  return path.join(syncDir, SYNC_SUBDIR, DAEMON_LOG_FILENAME);
}

/**
 * Write the daemon PID to config.json
 */
export async function writeDaemonPid(syncDir: string, pid: number): Promise<void> {
  const configPath = path.join(syncDir, SYNC_SUBDIR, "config.json");

  try {
    const configRaw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configRaw) as SyncConfig;
    config.daemonPid = pid;
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write daemon PID to config:", error);
    throw error;
  }
}

/**
 * Clear the daemon PID from config.json
 */
export async function clearDaemonPid(syncDir: string): Promise<void> {
  const configPath = path.join(syncDir, SYNC_SUBDIR, "config.json");

  try {
    const configRaw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configRaw) as SyncConfig;
    config.daemonPid = null;
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    // If file doesn't exist or parse fails, just ignore
    console.error("Failed to clear daemon PID from config:", error);
  }
}

/**
 * Check if we're running as a daemon child process
 */
export function isDaemonChild(): boolean {
  return process.env.SYNC_DAEMON_CHILD === "1";
}

/**
 * Daemonize the current process
 * Forks to background, redirects output to log file, writes PID to config
 * Returns true if parent process (should exit), false if child (should continue)
 */
export async function daemonize(syncDir: string): Promise<{ isParent: boolean; logPath: string; pid: number }> {
  const logPath = getDaemonLogPath(syncDir);

  // Ensure .sync directory exists
  const syncSubdir = path.join(syncDir, SYNC_SUBDIR);
  await fs.mkdir(syncSubdir, { recursive: true });

  // Open log file in append mode
  const logFile = await fs.open(logPath, "a");

  // Write startup message to log
  const timestamp = new Date().toISOString();
  await logFile.write(`[${timestamp}] === Daemon starting ===\n`);

  // Spawn child process with detached: true
  // The child will have SYNC_DAEMON_CHILD=1 in its environment
  const child = spawn(process.argv[0], process.argv.slice(1), {
    detached: true,
    stdio: ["ignore", logFile.fd, logFile.fd],
    env: {
      ...process.env,
      SYNC_DAEMON_CHILD: "1",
    },
    cwd: process.cwd(),
  });

  // Unref so parent doesn't wait for child
  child.unref();

  const pid = child.pid!;

  // Write PID to config
  await writeDaemonPid(syncDir, pid);

  // Parent process: log and exit
  await logFile.write(`[${new Date().toISOString()}] Daemon spawned with PID: ${pid}\n`);
  await logFile.close();

  return { isParent: true, logPath, pid };
}

/**
 * Tail the daemon log file
 */
export async function tailDaemonLog(syncDir: string, lines: number = 50): Promise<void> {
  const logPath = getDaemonLogPath(syncDir);

  try {
    const content = await fs.readFile(logPath, "utf-8");
    const allLines = content.split("\n");
    const lastLines = allLines.slice(-lines);

    for (const line of lastLines) {
      console.log(line);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      console.error("No daemon log found. Is the daemon running?");
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Watch and tail the daemon log file continuously
 */
export async function watchDaemonLog(syncDir: string): Promise<void> {
  const logPath = getDaemonLogPath(syncDir);

  try {
    // Get initial file size
    const stats = await fs.stat(logPath);
    let currentSize = stats.size;

    // Poll for new content
    const pollInterval = 1000; // 1 second

    while (true) {
      try {
        const newStats = await fs.stat(logPath);
        const newSize = newStats.size;

        if (newSize > currentSize) {
          // Read new content
          const file = await fs.open(logPath, "r");
          const buffer = Buffer.alloc(newSize - currentSize);
          await file.read(buffer, 0, newSize - currentSize, currentSize);
          await file.close();

          process.stdout.write(buffer.toString());
          currentSize = newSize;
        }
      } catch (error) {
        // File might have been rotated or deleted
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          console.error("Daemon log file not found. Is the daemon running?");
          process.exit(1);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      console.error("No daemon log found. Is the daemon running?");
      process.exit(1);
    }
    throw error;
  }
}
