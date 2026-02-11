import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(homedir(), ".kontexted");
const LOG_FILE = join(LOG_DIR, "log.txt");

let logEnabled = true;

/**
 * Set whether logging is enabled
 */
export function setLogEnabled(enabled: boolean): void {
  logEnabled = enabled;
}

/**
 * Format a timestamp for log entries
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Write a log entry to the log file (fire-and-forget)
 */
function writeLog(level: string, message: string, data?: unknown): void {
  if (!logEnabled) return;

  // Fire and forget - don't await, handle errors internally
  (async () => {
    try {
      await mkdir(LOG_DIR, { recursive: true });

      const timestamp = formatTimestamp();
      let logLine = `[${timestamp}] [${level}] ${message}`;

      if (data !== undefined) {
        if (data instanceof Error) {
          logLine += ` | Error: ${data.message}\n${data.stack}`;
        } else {
          logLine += ` | ${JSON.stringify(data)}`;
        }
      }

      logLine += "\n";

      await appendFile(LOG_FILE, logLine, "utf-8");
    } catch {
      // Silently fail if logging fails
    }
  })();
}

/**
 * Log an info message (file only)
 */
export function logInfo(message: string, data?: unknown): void {
  writeLog("INFO", message, data);
}

/**
 * Log a debug message (file only)
 */
export function logDebug(message: string, data?: unknown): void {
  writeLog("DEBUG", message, data);
}

/**
 * Log a warning message (file only)
 */
export function logWarn(message: string, data?: unknown): void {
  writeLog("WARN", message, data);
}

/**
 * Log an error message (file only)
 */
export function logError(message: string, data?: unknown): void {
  writeLog("ERROR", message, data);
}

/**
 * Get the log file path
 */
export function getLogFilePath(): string {
  return LOG_FILE;
}
