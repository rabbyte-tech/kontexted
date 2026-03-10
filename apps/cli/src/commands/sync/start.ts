import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "@/lib/config";
import { ApiClient } from "@/lib/api-client";
import { SyncEngine } from "@/lib/sync/sync-engine";
import { createAuthenticatedClient } from "@/lib/sync/auth-utils";
import type { Profile } from "@/types";
import {
  findSyncDir,
  loadSyncConfig,
  daemonize,
  isDaemonChild,
  watchDaemonLog,
  clearDaemonPid,
} from "@/lib/sync/command-utils";

/**
 * Setup console logging to file in daemon mode
 */
async function setupDaemonLogging(syncDir: string): Promise<void> {
  const logPath = path.join(syncDir, ".sync", "daemon.log");
  const logFile = await fs.open(logPath, "a");

  // Override console.log and console.error to write to log file
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  const writeToLog = async (...args: unknown[]) => {
    const timestamp = new Date().toISOString();
    const message = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    const logLine = `[${timestamp}] ${message}\n`;
    await logFile.write(logLine);
  };

  console.log = async (...args: unknown[]) => {
    await writeToLog(...args);
    originalLog(...args);
  };

  console.error = async (...args: unknown[]) => {
    await writeToLog(...args);
    originalError(...args);
  };

  console.warn = async (...args: unknown[]) => {
    await writeToLog(...args);
    originalWarn(...args);
  };

  // Handle uncaught errors
  process.on("uncaughtException", async (error) => {
    await logFile.write(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${error.stack || error.message}\n`);
    originalError("Uncaught exception:", error);
    await clearDaemonPid(syncDir);
    process.exit(1);
  });

  process.on("unhandledRejection", async (reason) => {
    await logFile.write(`[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason}\n`);
    originalError("Unhandled rejection:", reason);
  });
}

/**
 * Handler for the sync start command
 */
export async function handler(argv: {
  daemon?: boolean;
  foreground?: boolean;
  dir?: string;
  log?: boolean;
}): Promise<void> {
  const cwd = process.cwd();

  // Check if we're the daemon child process FIRST
  // This must be checked before the existing daemon check to avoid
  // the child process detecting itself as an existing daemon
  const isChild = isDaemonChild();

  // Step 1: Find the sync directory
  console.log("Finding sync directory...");
  const syncDir = await findSyncDir(cwd, argv.dir);
  console.log(`Using sync directory: ${syncDir}`);

  // Handle --log flag to tail daemon logs
  if (argv.log) {
    console.log("Tailing daemon logs...");
    await watchDaemonLog(syncDir);
    return;
  }

  // Only check for existing daemon if we're NOT the child process
  // The child process IS the daemon, so it shouldn't check for itself
  if (!isChild) {
    const existingSyncConfig = await loadSyncConfig(syncDir);
    if (existingSyncConfig.daemonPid) {
      try {
        process.kill(existingSyncConfig.daemonPid, 0);
        console.log(`Daemon is already running with PID: ${existingSyncConfig.daemonPid}`);
        console.log("Use 'kontexted sync stop' to stop it first, or 'kontexted sync start --log' to view logs");
        process.exit(1);
      } catch {
        // Process not running, clear stale PID
        console.log("Clearing stale daemon PID...");
        await clearDaemonPid(syncDir);
      }
    }
  }

  // Determine if we should run in daemon mode
  // --daemon flag enables daemon mode
  // --foreground flag explicitly disables daemon mode
  const isDaemon = argv.daemon && argv.foreground !== true;

  // If daemon mode requested, spawn child process and exit
  if (isDaemon && !isChild) {
    console.log("Starting sync daemon in background...");
    const { logPath, pid } = await daemonize(syncDir);
    console.log(`Daemon started with PID: ${pid}`);
    console.log(`Logs: ${logPath}`);
    console.log("Use 'kontexted sync start --log' to view logs");
    process.exit(0);
  }

  // If we're the child process, setup logging and continue
  if (isChild) {
    await setupDaemonLogging(syncDir);
    console.log("Daemon process started");

    // Ensure PID is cleared on any exit (normal or abnormal)
    const cleanup = async () => {
      await clearDaemonPid(syncDir);
    };
    process.on("exit", cleanup);
  }

  // Step 2: Load sync config
  console.log("Loading sync configuration...");
  const syncConfig = await loadSyncConfig(syncDir);

  // Step 3: Authenticate and create API client
  console.log("Validating profile and authenticating...");
  let apiClient: ApiClient;
  let profile: Profile;

  try {
    const auth = await createAuthenticatedClient(syncConfig.alias);
    apiClient = auth.client;
    profile = auth.profile;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\nError: ${error.message}`);
    } else {
      console.error("\nError: Failed to authenticate. Please run 'kontexted login'...");
    }
    process.exit(1);
  }

  // Test API connection
  try {
    const response = await apiClient.get(`/api/sync/pull?workspaceSlug=${encodeURIComponent(syncConfig.workspaceSlug)}`);
    if (!response.ok) {
      // 401 should not happen here since we already validated, but handle just in case
      if (response.status === 401) {
        console.error("\nError: Authentication failed unexpectedly. Please try 'kontexted login'...");
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

  if (isChild) {
    console.log("Sync daemon running. Press Ctrl+C to stop.");
  } else {
    console.log("Sync started. Press Ctrl+C to stop.");
  }

  // Handle shutdown signals
  const shutdown = async () => {
    console.log("\nStopping sync...");
    syncEngine.stop();

    // Clear daemon PID if we're running as daemon
    if (isChild) {
      await clearDaemonPid(syncDir);
      console.log("Daemon stopped and PID cleared.");
    }

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
      description: "Run sync daemon in background",
      default: false,
    })
    .option("foreground", {
      alias: "f",
      type: "boolean",
      description: "Run sync daemon in foreground (blocking)",
    })
    .option("dir", {
      type: "string",
      description: "Sync directory (default: .kontexted in current directory)",
    })
    .option("log", {
      alias: "l",
      type: "boolean",
      description: "Tail daemon log file",
      default: false,
    });
};

export async function handlerYargs(argv: {
  daemon?: boolean;
  foreground?: boolean;
  dir?: string;
  log?: boolean;
}): Promise<void> {
  await handler({
    daemon: argv.daemon,
    foreground: argv.foreground,
    dir: argv.dir,
    log: argv.log,
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
    .option("-d, --daemon", "Run sync daemon in background", false)
    .option("-f, --foreground", "Run sync daemon in foreground (blocking)")
    .option("--dir <directory>", "Sync directory (default: .kontexted in current directory)")
    .option("-l, --log", "Tail daemon log file", false)
    .action(async (opts) => {
      await handlerYargs({
        daemon: opts.daemon,
        foreground: opts.foreground,
        dir: opts.dir,
        log: opts.log,
      });
    });
}
