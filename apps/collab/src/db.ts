import "dotenv/config";

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const dialect = process.env.DATABASE_DIALECT === "sqlite" ? "sqlite" : "postgresql";

let db: ReturnType<typeof drizzlePg>;

if (dialect === "sqlite") {
  const dbPath = process.env.DATABASE_URL ?? "../webapp/data/kontexted.db";
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  db = drizzleSqlite(sqlite) as unknown as ReturnType<typeof drizzlePg>;
} else {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the collab server");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  db = drizzlePg(pool);
}

export { db };
