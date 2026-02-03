#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations"
);

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("[ERROR] DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log("Migrations completed.");
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

main();
