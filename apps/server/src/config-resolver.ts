import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

// ESM __dirname equivalent
const __dirname = fileURLToPath(new URL(".", import.meta.url));

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
 * Generate a random readable invite code
 * Excludes ambiguous characters: 0, o, 1, l
 */
function generateInviteCode(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  let code = '';
  for (let i = 0; i < 16; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
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
    auth: {
      betterAuthSecret: randomBytes(32).toString('hex'),
      inviteCode: generateInviteCode(),
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

  const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
  if (process.env.NODE_ENV === 'production' && !betterAuthSecret) {
    throw new Error('BETTER_AUTH_SECRET is required in production');
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
    auth: {
      betterAuthSecret: betterAuthSecret || defaults.auth.betterAuthSecret,
      inviteCode: process.env.INVITE_CODE || defaults.auth.inviteCode,
    },
    paths: {
      publicDir: process.env.KONTEXTED_PUBLIC_DIR,
      migrationsDir: process.env.KONTEXTED_MIGRATIONS_DIR,
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

    const betterAuthSecret = parsed.auth?.betterAuthSecret;

    if (process.env.NODE_ENV === 'production' && !betterAuthSecret) {
      throw new Error('auth.betterAuthSecret is required in production');
    }

    const defaults = getDefaults();

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
      auth: {
        betterAuthSecret: betterAuthSecret || defaults.auth.betterAuthSecret,
        inviteCode: parsed.auth?.inviteCode || defaults.auth.inviteCode,
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
  console.log(fileConfig)
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

/**
 * Resolve the public directory path.
 * Priority: KONTEXTED_PUBLIC_DIR env var > config file > default
 */
export function resolvePublicDir(): string {
  // Priority 1: Environment variable
  if (process.env.KONTEXTED_PUBLIC_DIR) {
    return process.env.KONTEXTED_PUBLIC_DIR;
  }

  // Priority 2: Config file
  const config = loadFromFile();
  if (config?.paths?.publicDir) {
    return config.paths.publicDir;
  }

  // Priority 3: Default (relative to current file - for Docker/dev)
  return join(__dirname, "public");
}

/**
 * Resolve the migrations directory path.
 * Priority: KONTEXTED_MIGRATIONS_DIR env var > config file > default
 */
export function resolveMigrationsDir(dialect: 'sqlite' | 'postgresql'): string {
  // Priority 1: Environment variable
  if (process.env.KONTEXTED_MIGRATIONS_DIR) {
    return join(process.env.KONTEXTED_MIGRATIONS_DIR, dialect);
  }

  // Priority 2: Config file
  const config = loadFromFile();
  if (config?.paths?.migrationsDir) {
    return join(config.paths.migrationsDir, dialect);
  }

  // Priority 3: Default (relative to dist/db/ - for Docker/dev)
  return join(__dirname, "..", "migrations", dialect);
}
