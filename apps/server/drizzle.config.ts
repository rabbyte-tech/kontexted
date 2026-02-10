import { defineConfig } from "drizzle-kit";
import "dotenv/config";

const dialect = process.env.DATABASE_DIALECT === "sqlite" ? "sqlite" : "postgresql";

if (!process.env.DATABASE_URL && dialect === "postgresql") {
  throw new Error("DATABASE_URL is not set");
}

// Use relative paths - drizzle-kit resolves them from the config file location
const schemaPath = `./src/db/schema/${dialect}/index.ts`;
const migrationsPath = `./migrations/${dialect}`;

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
