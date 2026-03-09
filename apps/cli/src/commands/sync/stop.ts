import { readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import type { SyncConfig } from "@/lib/sync/types";

// ============ Types ============

interface StopOptions {
  dir?: string;
  force?: boolean;
}

// ============ Constants ============

const SYNC_DIR_NAME = ".kontexted";
const SYNC_SUBDIR = ".sync";
const CONFIG_FILENAME = "config.json";
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000; // 10 seconds
const POLL_INTERVAL_MS = 500; // Check every 500ms

// ============ Yargs Command Module ============

export const command = "stop";
export const desc = "Stop sync daemon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs
    .option("force", {
      alias: "f",
      type: "boolean",
      description: "Force kill the sync daemon (SIGKILL)",
    });
};

export const handler = async (argv: StopOptions): Promise<void> => {
  const projectRoot = process.cwd();
  const syncDirName = argv.dir || SYNC_DIR_NAME;
  const syncDir = join(projectRoot, syncDirName);
  const configPath = join(syncDir, SYNC_SUBDIR, CONFIG_FILENAME);

  // Step 1: Check if sync directory exists
  try {
    await access(syncDir, constants.F_OK);
  } catch {
    console.error(`Error: Sync directory '${syncDirName}' not found.`);
    console.error("Run 'kontexted sync init' first to initialize sync.");
    process.exit(1);
  }

  // Step 2: Load sync config
  let syncConfig: SyncConfig;
  try {
    const configRaw = await readFile(configPath, "utf-8");
    syncConfig = JSON.parse(configRaw) as SyncConfig;
  } catch (error) {
    console.error(`Error: Failed to read sync config at '${configPath}'.`);
    console.error("Run 'kontexted sync init' first to initialize sync.");
    process.exit(1);
  }

  // Step 3: Check if daemon is running
  const daemonPid = syncConfig.daemonPid;
  if (!daemonPid) {
    console.log("Sync daemon is not running.");
    return;
  }

  // Step 4: Check if process exists and is running
  const isProcessRunning = (pid: number): boolean => {
    try {
      // Signal 0 checks if process exists without sending a signal
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // ESRCH means no such process
      // EPERM means process exists but we don't have permission
      // If EPERM, the process is still running
      const errorCode = (err as NodeJS.ErrnoException).code;
      if (errorCode === "EPERM") {
        return true;
      }
      return false;
    }
  };

  // Step 5: Check if already not running
  if (!isProcessRunning(daemonPid)) {
    console.log(`Daemon process (PID: ${daemonPid}) is not running.`);
    console.log("Clearing stale PID from config...");
    await clearDaemonPid(configPath, syncConfig);
    return;
  }

  // Step 6: Send termination signal
  const signal = argv.force ? "SIGKILL" : "SIGTERM";
  console.log(`Sending ${signal} to daemon process (PID: ${daemonPid})...`);

  try {
    process.kill(daemonPid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      console.log("Daemon process has already terminated.");
      await clearDaemonPid(configPath, syncConfig);
      return;
    }
    console.error(`Error: Failed to send signal to process: ${(error as Error).message}`);
    process.exit(1);
  }

  // Step 7: Wait for graceful shutdown (unless --force was used)
  if (!argv.force) {
    console.log("Waiting for graceful shutdown...");
    const startTime = Date.now();

    while (Date.now() - startTime < GRACEFUL_SHUTDOWN_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      if (!isProcessRunning(daemonPid)) {
        console.log("✓ Sync daemon stopped successfully.");
        await clearDaemonPid(configPath, syncConfig);
        return;
      }
    }

    // Timeout reached - send SIGKILL
    console.log("Graceful shutdown timed out. Sending SIGKILL...");
    try {
      process.kill(daemonPid, "SIGKILL");
      // Wait a bit for SIGKILL to take effect
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      if (!isProcessRunning(daemonPid)) {
        console.log("✓ Sync daemon forcefully stopped.");
        await clearDaemonPid(configPath, syncConfig);
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        console.error(`Error: Failed to kill process: ${(error as Error).message}`);
      }
    }

    console.error("Error: Failed to stop daemon process.");
    process.exit(1);
  } else {
    // With --force, just verify it's stopped after a short delay
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    if (!isProcessRunning(daemonPid)) {
      console.log("✓ Sync daemon forcefully stopped.");
      await clearDaemonPid(configPath, syncConfig);
      return;
    }

    console.error("Error: Failed to stop daemon process.");
    process.exit(1);
  }
};

/**
 * Clear the daemon PID from config.json
 */
async function clearDaemonPid(configPath: string, syncConfig: SyncConfig): Promise<void> {
  syncConfig.daemonPid = null;
  await writeFile(configPath, JSON.stringify(syncConfig, null, 2), "utf-8");
}

// ============ Register with Commander ============

/**
 * Register the sync stop command with the sync command.
 */
export function registerStopCommand(syncCommand: Command): void {
  syncCommand
    .command("stop")
    .description(desc)
    .option("--dir <directory>", "Sync directory (default: .kontexted)")
    .option("-f, --force", "Force kill the sync daemon (SIGKILL)")
    .action(async (opts) => {
      await handler({
        dir: opts.dir,
        force: opts.force,
      });
    });
}
