#!/usr/bin/env bun
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { migrate as migrateSqlite } from "drizzle-orm/bun-sqlite/migrator";
import Database from "bun:sqlite";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const dialect = process.env.DATABASE_DIALECT === "sqlite" ? "sqlite" : "postgresql";

// Migrations path: ./migrations/${dialect}/ relative to dist/ directory
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  `migrations/${dialect}`
);

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("[ERROR] DATABASE_URL environment variable is not set");
    process.exit(1);
  }

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
