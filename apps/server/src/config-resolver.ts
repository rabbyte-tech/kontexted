import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Configuration structure
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
}

/**
 * Default configuration
 */
function getDefaults(): ServerConfig {
  return {
    database: {
      dialect: 'sqlite',
      url: join(homedir(), '.kontexted', 'data', 'kontexted.db'),
    },
    server: {
      port: 3000,
      host: '127.0.0.1',
    },
    logging: {
      level: 'info',
    },
    collab: {
      tokenSecret: 'dev-secret',
    },
  };
}

/**
 * Loads configuration from environment variables
 * Returns null if no env vars are set (indicates not in Docker mode)
 */
function loadFromEnv(): ServerConfig | null {
  const hasEnvVars = process.env.DATABASE_URL || process.env.PORT || process.env.HOST;

  if (!hasEnvVars) {
    return null;
  }

  const defaults = getDefaults();

  const tokenSecret =
    process.env.COLLAB_TOKEN_SECRET ??
    (process.env.NODE_ENV === 'production' ? undefined : 'dev-secret');

  if (process.env.NODE_ENV === 'production' && !tokenSecret) {
    throw new Error('COLLAB_TOKEN_SECRET is required in production');
  }

  return {
    database: {
      dialect: (process.env.DATABASE_DIALECT as 'sqlite' | 'postgresql') || defaults.database.dialect,
      url: process.env.DATABASE_URL || defaults.database.url,
    },
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : defaults.server.port,
      host: process.env.HOST || defaults.server.host,
    },
    logging: {
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || defaults.logging.level,
    },
    collab: {
      tokenSecret: tokenSecret || defaults.collab.tokenSecret,
    },
  };
}

/**
 * Loads configuration from config file
 * Returns null if file doesn't exist
 */
function loadFromFile(): ServerConfig | null {
  const configPath = join(homedir(), '.kontexted', 'config.json');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Basic validation
    if (!parsed.server || !parsed.database) {
      console.warn('Config file missing required fields, using defaults');
      return null;
    }

    const tokenSecret = parsed.collab?.tokenSecret;

    if (process.env.NODE_ENV === 'production' && !tokenSecret) {
      throw new Error('COLLAB_TOKEN_SECRET is required in production');
    }

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
        tokenSecret: tokenSecret || 'dev-secret',
      },
    };
  } catch (error) {
    console.warn('Failed to load config file:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Resolves configuration from all sources
 * Priority: Environment variables > Config file > Defaults
 */
export function resolveConfig(): ServerConfig {
  // Priority 1: Environment variables (Docker/enterprise)
  const envConfig = loadFromEnv();
  if (envConfig) {
    console.log('Using configuration from environment variables');
    return envConfig;
  }

  // Priority 2: Config file (local CLI users)
  const fileConfig = loadFromFile();
  if (fileConfig) {
    console.log('Using configuration from ~/.kontexted/config.json');
    return fileConfig;
  }

  // Priority 3: Defaults
  console.log('Using default configuration');
  return getDefaults();
}

/**
 * Gets config source for debugging
 */
export function getConfigSource(): 'environment' | 'file' | 'defaults' {
  if (loadFromEnv()) return 'environment';
  if (loadFromFile()) return 'file';
  return 'defaults';
}