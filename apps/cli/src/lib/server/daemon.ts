import { spawn, ChildProcess } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { mkdirSync, closeSync, openSync } from 'fs';
import { dirname } from 'path';
import { getBinaryPath } from './binary.js';
import { LOG_FILE, PID_FILE, LOGS_DIR, KONTEXTED_DIR } from './constants.js';

/**
 * Ensures required directories exist
 */
function ensureDirectories(): void {
  if (!existsSync(KONTEXTED_DIR)) {
    mkdirSync(KONTEXTED_DIR, { recursive: true });
  }
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Reads the PID from the PID file
 * Returns null if the file doesn't exist
 */
export function getPid(): number | null {
  if (!existsSync(PID_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(PID_FILE, 'utf-8');
    const pid = parseInt(content.trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Checks if a process with the given PID is running
 * Uses signal 0 to check process existence without actually sending a signal
 */
export function isRunning(pid: number): boolean {
  try {
    // Signal 0 checks if the process exists without sending any signal
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but we don't have permission to signal it
    // ESRCH means no such process
    if (error instanceof Error && 'code' in error) {
      const code = (error as NodeJS.ErrnoException).code;
      return code === 'EPERM';
    }
    return false;
  }
}

/**
 * Starts the server
 * @param options.foreground - If true, runs in foreground (blocks). If false, runs as daemon
 * @returns The PID of the started server
 */
export async function startServer(options: { foreground?: boolean } = {}): Promise<number> {
  const binaryPath = getBinaryPath();

  if (!binaryPath) {
    throw new Error('Server binary not found. Please ensure the platform package is installed.');
  }

  ensureDirectories();

  // Check if already running
  const existingPid = getPid();
  if (existingPid && isRunning(existingPid)) {
    throw new Error(`Server is already running with PID ${existingPid}`);
  }

  const foreground = options.foreground ?? false;

  if (foreground) {
    // Run in foreground - inherited stdio
    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, [], {
        stdio: 'inherit',
        detached: false,
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to start server: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });

      // Return the pid (will be the current process since we're not detaching)
      resolve(child.pid!);
    });
  } else {
    // Run as daemon - detached process with redirected output
    // Open log file for appending and get file descriptor
    const logFd = openSync(LOG_FILE, 'a');

    const child = spawn(binaryPath, [], {
      stdio: ['ignore', logFd, logFd], // Use file descriptor, not stream
      detached: true,
      env: { ...process.env },
    });

    // Close the file descriptor in parent - child has its own copy
    closeSync(logFd);

    // Unref to allow the parent to exit independently
    child.unref();

    const pid = child.pid!;

    // Write PID to file
    writeFileSync(PID_FILE, pid.toString(), 'utf-8');

    // Wait a moment to ensure the process starts successfully
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify the process is running
    if (!isRunning(pid)) {
      throw new Error('Server failed to start');
    }

    return pid;
  }
}

/**
 * Stops the server
 * @param options.force - If true, uses SIGKILL instead of SIGTERM
 * @returns True if the server was stopped, false if it wasn't running
 */
export async function stopServer(options: { force?: boolean } = {}): Promise<boolean> {
  const force = options.force ?? false;
  const pid = getPid();

  if (!pid) {
    return false;
  }

  if (!isRunning(pid)) {
    // Clean up stale PID file
    try {
      unlinkSync(PID_FILE);
    } catch {
      // Ignore errors
    }
    return false;
  }

  const signal = force ? 'SIGKILL' : 'SIGTERM';

  try {
    process.kill(pid, signal);

    // Wait for process to exit
    const maxWaitMs = force ? 5000 : 30000;
    const checkInterval = 100;
    let waited = 0;

    while (isRunning(pid) && waited < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (isRunning(pid)) {
      throw new Error('Server did not stop in time');
    }

    // Clean up PID file
    try {
      unlinkSync(PID_FILE);
    } catch {
      // Ignore errors
    }

    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('ESRCH')) {
      // Process doesn't exist, clean up
      try {
        unlinkSync(PID_FILE);
      } catch {
        // Ignore errors
      }
      return false;
    }
    throw error;
  }
}

/**
 * Gets the current server status
 */
export function getServerStatus(): { running: boolean; pid?: number; startedAt?: Date } {
  const pid = getPid();

  if (!pid) {
    return { running: false };
  }

  const running = isRunning(pid);

  if (!running) {
    // Clean up stale PID file
    try {
      unlinkSync(PID_FILE);
    } catch {
      // Ignore errors
    }
    return { running: false };
  }

  // Note: Getting the actual start time would require platform-specific code
  // For now, we just report that it's running with the PID
  return {
    running: true,
    pid,
    // startedAt would require reading /proc/<pid>/stat on Linux or similar
  };
}
