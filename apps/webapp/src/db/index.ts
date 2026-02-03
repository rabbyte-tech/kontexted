import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import "dotenv/config";

const dialect = process.env.DATABASE_DIALECT === "sqlite" ? "sqlite" : "postgresql";

let db: ReturnType<typeof drizzlePg>;

if (dialect === "sqlite") {
  const dbPath = process.env.DATABASE_URL ?? "./data/kontexted.db";
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  db = drizzleSqlite(sqlite) as unknown as ReturnType<typeof drizzlePg>;
} else {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg(pool);
}

export { db };
