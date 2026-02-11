#!/usr/bin/env bun
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { Pool } from "pg";
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { migrate as migrateSqlite } from "drizzle-orm/bun-sqlite/migrator";
import Database from "bun:sqlite";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { dirname } from "node:path";

const dialect = process.env.DATABASE_DIALECT === "sqlite" ? "sqlite" : "postgresql";

/**
 * Read paths from config file (~/.kontexted/config.json)
 */
function readPathsFromConfig() {
  const configPath = path.join(homedir(), ".kontexted", "config.json");
  
  if (!existsSync(configPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content);
    return parsed.paths || null;
  } catch {
    return null;
  }
}

// Migrations path: ./migrations/${dialect}/ relative to dist/ directory
/**
 * Resolve migrations directory.
 *
 * Resolution order:
 * 1. KONTEXTED_MIGRATIONS_DIR environment variable (for compiled binary)
 * 2. Config file (~/.kontexted/config.json paths.migrationsDir)
 * 3. Relative to current file (for Docker and dev builds)
 */
function getMigrationsDir() {
  const dialectDir = dialect; // 'sqlite' or 'postgresql'

  // Priority 1: Explicit environment variable (compiled binary)
  if (process.env.KONTEXTED_MIGRATIONS_DIR) {
    return path.resolve(process.env.KONTEXTED_MIGRATIONS_DIR, dialectDir);
  }

  // Priority 2: Config file
  const paths = readPathsFromConfig();
  if (paths?.migrationsDir) {
    return path.resolve(paths.migrationsDir, dialectDir);
  }

  // Priority 3: Default - relative to dist/db/ (Docker and tsc builds)
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    `migrations/${dialectDir}`
  );
}

const MIGRATIONS_DIR = getMigrationsDir();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("[ERROR] DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log(`[migrate] Using migrations directory: ${MIGRATIONS_DIR}`);
  console.log(`[migrate] Database dialect: ${dialect}`);

  if (dialect === "sqlite") {
    const dbPath = process.env.DATABASE_URL ?? "./data/kontexted.db";
    mkdirSync(dirname(dbPath), { recursive: true });
    const sqlite = new Database(dbPath, { create: true });
    const db = drizzleSqlite({ client: sqlite });
    try {
      await migrateSqlite(db, { migrationsFolder: MIGRATIONS_DIR });
      console.log("SQLite migrations completed.");
    } catch (err) {
      console.error("[ERROR] SQLite migration failed");
      if (err instanceof Error) {
        console.error(err.message);
        if (err.stack) {
          console.error(err.stack);
        }
      } else {
        console.error(err);
      }
      process.exitCode = 1;
    } finally {
      sqlite.close();
    }
  } else {
    const pool = new Pool({
      connectionString: databaseUrl,
    });

    const db = drizzle(pool);

    try {
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      console.log("PostgreSQL migrations completed.");
    } catch (err) {
      console.error("[ERROR] Migration failed");
      if (err instanceof Error) {
        console.error(err.message);
        if (err.stack) {
          console.error(err.stack);
        }
      } else {
        console.error(err);
      }
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}

main();
