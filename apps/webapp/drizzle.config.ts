import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";
import "dotenv/config";

const dialect = process.env.DATABASE_DIALECT === "sqlite" ? "sqlite" : "postgresql";

if (!process.env.DATABASE_URL && dialect === "postgresql") {
  throw new Error("DATABASE_URL is not set");
}

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(
  baseDir,
  `../../packages/kontexted-db/src/schema/${dialect}/index.ts`
);

const migrationsPath = path.resolve(
  baseDir,
  `./src/db/migrations/${dialect}`
);

export default defineConfig({
  schema: schemaPath,
  out: migrationsPath,
  dialect,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./data/kontexted.db",
  },
  verbose: true,
  strict: true,
});
