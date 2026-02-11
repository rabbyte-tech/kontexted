import { homedir } from 'os';
import { join } from 'path';

/**
 * Base Kontexted directory in user's home
 */
export const KONTEXTED_DIR = join(homedir(), '.kontexted');

/**
 * Path to the configuration file
 */
export const CONFIG_FILE = join(KONTEXTED_DIR, 'config.json');

/**
 * Directory for data storage (databases, etc.)
 */
export const DATA_DIR = join(KONTEXTED_DIR, 'data');

/**
 * Directory for log files
 */
export const LOGS_DIR = join(KONTEXTED_DIR, 'logs');

/**
 * Main server log file path
 */
export const LOG_FILE = join(LOGS_DIR, 'server.log');

/**
 * PID file for tracking the running server process
 */
export const PID_FILE = join(KONTEXTED_DIR, 'server.pid');

/**
 * Platform-specific package mapping
 * Maps platform identifiers to their corresponding npm packages
 */
export const PLATFORM_PACKAGES: Record<string, string> = {
  'darwin-arm64': '@kontexted/darwin-arm64',
  'linux-x64': '@kontexted/linux-x64',
  'win32-x64': '@kontexted/windows-x64',
};
