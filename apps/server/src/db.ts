import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import Database from "bun:sqlite";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "@/config";
import "dotenv/config";

const dialect = config.database.dialect;

let db: ReturnType<typeof drizzlePg>;

if (dialect === "sqlite") {
  const dbPath = config.database.url;
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath, { create: true });
  db = drizzleSqlite({ client: sqlite }) as unknown as ReturnType<typeof drizzlePg>;
} else {
  if (!config.database.url) {
    throw new Error("DATABASE_URL is required for PostgreSQL");
  }
  const pool = new Pool({ connectionString: config.database.url });
  db = drizzlePg(pool);
}

export { db, dialect };

// Re-export schema tables
export * from "./db/schema";
