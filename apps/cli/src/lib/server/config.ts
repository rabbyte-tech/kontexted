import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { randomBytes } from 'crypto';
import {
  CONFIG_FILE,
  DATA_DIR,
  KONTEXTED_DIR,
} from './constants.js';
import { getMigrationsDir, getPublicDir } from './binary.js';

/**
 * Server configuration interface
 */
export interface ServerConfig {
  database: {
    dialect: 'sqlite' | 'postgresql';
    url: string;
  };
  server: {
    port: number;
    host: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
  collab: {
    tokenSecret: string;
  };
  auth: {
    betterAuthSecret: string;
    inviteCode: string;
  };
  paths?: {
    publicDir?: string;
    migrationsDir?: string;
  };
}

/**
 * Generates a secure random token secret (32 bytes as hex string)
 */
export function generateTokenSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generates a secure random auth secret (32 bytes as hex string)
 */
export function generateBetterAuthSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generates a readable invite code (16 alphanumeric chars, lowercase, no ambiguous chars)
 */
export function generateInviteCode(): string {
  // Use lowercase letters and digits, excluding: 0, o, 1, l (ambiguous)
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    code += chars[randomBytes(1)[0] % chars.length];
  }
  return code;
}

/**
 * Returns the default server configuration
 */
export function getDefaultConfig(): ServerConfig {
  const migrationsDir = getMigrationsDir();
  const publicDir = getPublicDir();

  const config: ServerConfig = {
    database: {
      dialect: 'sqlite',
      url: `${DATA_DIR}/kontexted.db`,
    },
    server: {
      port: 3000,
      host: '127.0.0.1',
    },
    logging: {
      level: 'info',
    },
    collab: {
      tokenSecret: generateTokenSecret(),
    },
    auth: {
      betterAuthSecret: generateBetterAuthSecret(),
      inviteCode: generateInviteCode(),
    },
  };

  // Add paths if platform package is available
  if (migrationsDir || publicDir) {
    config.paths = {
      migrationsDir: migrationsDir || undefined,
      publicDir: publicDir || undefined,
    };
  }

  return config;
}

/**
 * Checks if the configuration file exists
 */
export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

/**
 * Loads the server configuration from file
 * Returns null if the config file doesn't exist or is invalid
 */
export function loadConfig(): ServerConfig | null {
  if (!configExists()) {
    return null;
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content);

    // Basic validation
    if (!parsed.server || !parsed.database) {
      console.warn('Config file missing required fields, using defaults');
      return null;
    }

    const tokenSecret = parsed.collab?.tokenSecret;
    const betterAuthSecret = parsed.auth?.betterAuthSecret;
    const inviteCode = parsed.auth?.inviteCode;

    return {
      database: {
        dialect: parsed.database.dialect || 'sqlite',
        url: parsed.database.url,
      },
      server: {
        port: parsed.server.port || 3000,
        host: parsed.server.host || '127.0.0.1',
      },
      logging: {
        level: parsed.logging?.level || 'info',
      },
      collab: {
        tokenSecret: tokenSecret || generateTokenSecret(),
      },
      auth: {
        betterAuthSecret: betterAuthSecret || generateBetterAuthSecret(),
        inviteCode: inviteCode || generateInviteCode(),
      },
      paths: {
        publicDir: parsed.paths?.publicDir,
        migrationsDir: parsed.paths?.migrationsDir,
      },
    };
  } catch (error) {
    console.warn('Failed to load config file:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Saves the server configuration to file
 * Creates the directory if it doesn't exist
 */
export function saveConfig(config: ServerConfig): void {
  // Ensure the config directory exists
  const configDir = dirname(CONFIG_FILE);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Ensure the data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const content = JSON.stringify(config, null, 2);
  writeFileSync(CONFIG_FILE, content, 'utf-8');
}
