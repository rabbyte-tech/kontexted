import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

// ESM __dirname equivalent
const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Naming convention type for file/folder naming
 */
type NamingConvention = 'kebab-case' | 'camelCase' | 'snake_case' | 'PascalCase';

/**
 * Valid naming conventions array
 */
const VALID_NAMING_CONVENTIONS: NamingConvention[] = ['kebab-case', 'camelCase', 'snake_case', 'PascalCase'];

/**
 * Validates a naming convention value
 */
function validateNamingConvention(value: unknown): NamingConvention {
  if (typeof value === 'string' && VALID_NAMING_CONVENTIONS.includes(value as NamingConvention)) {
    return value as NamingConvention;
  }
  if (value !== undefined) {
    console.warn(`Invalid naming convention "${value}", falling back to "kebab-case". Valid values: ${VALID_NAMING_CONVENTIONS.join(', ')}`);
  }
  return 'kebab-case';
}

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
    trustedOrigins?: string[];
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
  collab: {
    tokenSecret: string;
  };
  auth: {
    betterAuthSecret: string;
    betterAuthUrl?: string;
    inviteCode: string;
    method?: 'email-password' | 'keycloak';
    keycloak?: {
      clientId: string;
      clientSecret: string;
      issuer: string;
    };
  };
  paths?: {
    publicDir?: string;
    migrationsDir?: string;
  };
  naming: {
    defaultConvention: NamingConvention;
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
      host: 'localhost',
    },
    logging: {
      level: 'info',
    },
    collab: {
      tokenSecret: 'dev-secret',
    },
    auth: {
      betterAuthSecret: randomBytes(32).toString('hex'),
      betterAuthUrl: undefined,
      inviteCode: generateInviteCode(),
      method: 'email-password',
      keycloak: undefined,
    },
    naming: {
      defaultConvention: 'kebab-case' as NamingConvention,
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

  // Parse trusted origins from comma-separated string
  const trustedOriginsStr = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  const trustedOrigins = trustedOriginsStr
    ? trustedOriginsStr.split(',').map((origin) => origin.trim()).filter(Boolean)
    : undefined;

  // Build keycloak config if all required env vars are present
  const keycloakClientId = process.env.AUTH_KEYCLOAK_ID;
  const keycloakClientSecret = process.env.AUTH_KEYCLOAK_SECRET;
  const keycloakIssuer = process.env.AUTH_KEYCLOAK_ISSUER;
  const keycloak = keycloakClientId && keycloakClientSecret && keycloakIssuer
    ? {
        clientId: keycloakClientId,
        clientSecret: keycloakClientSecret,
        issuer: keycloakIssuer,
      }
    : undefined;

  const authMethod = (process.env.AUTH_METHOD as 'email-password' | 'keycloak') || 'email-password';

  // Validate keycloak configuration if method is 'keycloak'
  if (authMethod === 'keycloak' && !keycloak) {
    throw new Error('AUTH_KEYCLOAK_ID, AUTH_KEYCLOAK_SECRET, and AUTH_KEYCLOAK_ISSUER are required when AUTH_METHOD is "keycloak"');
  }

  return {
    database: {
      dialect: (process.env.DATABASE_DIALECT as 'sqlite' | 'postgresql') || defaults.database.dialect,
      url: process.env.DATABASE_URL || defaults.database.url,
    },
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : defaults.server.port,
      host: process.env.HOST || defaults.server.host,
      trustedOrigins,
    },
    logging: {
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || defaults.logging.level,
    },
    collab: {
      tokenSecret: tokenSecret || defaults.collab.tokenSecret,
    },
    auth: {
      betterAuthSecret: betterAuthSecret || defaults.auth.betterAuthSecret,
      betterAuthUrl: process.env.BETTER_AUTH_URL || undefined,
      inviteCode: process.env.INVITE_CODE || defaults.auth.inviteCode,
      method: authMethod,
      keycloak,
    },
    paths: {
      publicDir: process.env.KONTEXTED_PUBLIC_DIR,
      migrationsDir: process.env.KONTEXTED_MIGRATIONS_DIR,
    },
    naming: {
      defaultConvention: validateNamingConvention(process.env.DEFAULT_NAMING_CONVENTION),
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

    // Parse trusted origins from array or comma-separated string
    let trustedOrigins: string[] | undefined;
    if (parsed.server?.trustedOrigins) {
      if (Array.isArray(parsed.server.trustedOrigins)) {
        trustedOrigins = parsed.server.trustedOrigins.filter((origin: unknown): origin is string => typeof origin === 'string');
      } else if (typeof parsed.server.trustedOrigins === 'string') {
        trustedOrigins = parsed.server.trustedOrigins.split(',').map((o: string) => o.trim()).filter(Boolean);
      }
    }

    // Build keycloak config from file
    const keycloak = parsed.auth?.keycloak
      ? {
          clientId: parsed.auth.keycloak.clientId,
          clientSecret: parsed.auth.keycloak.clientSecret,
          issuer: parsed.auth.keycloak.issuer,
        }
      : undefined;

    const authMethod = parsed.auth?.method || 'email-password';

    // Validate keycloak configuration if method is 'keycloak'
    if (authMethod === 'keycloak' && !keycloak) {
      throw new Error('auth.keycloak configuration is required when auth.method is "keycloak"');
    }

    return {
      database: {
        dialect: parsed.database.dialect || 'sqlite',
        url: parsed.database.url,
      },
      server: {
        port: parsed.server.port || 3000,
        host: parsed.server.host || '127.0.0.1',
        trustedOrigins,
      },
      logging: {
        level: parsed.logging?.level || 'info',
      },
      collab: {
        tokenSecret: tokenSecret || 'dev-secret',
      },
      auth: {
        betterAuthSecret: betterAuthSecret || defaults.auth.betterAuthSecret,
        betterAuthUrl: parsed.auth?.betterAuthUrl,
        inviteCode: parsed.auth?.inviteCode || defaults.auth.inviteCode,
        method: authMethod,
        keycloak,
      },
      paths: {
        publicDir: parsed.paths?.publicDir,
        migrationsDir: parsed.paths?.migrationsDir,
      },
      naming: {
        defaultConvention: validateNamingConvention(parsed.naming?.defaultConvention),
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
