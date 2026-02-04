import { sql } from "drizzle-orm";
import { integer, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./user";

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  },
  (table) => [
    uniqueIndex("workspaces_slug_idx").on(table.slug),
    index("workspaces_owner_idx").on(table.createdByUserId),
  ]
);
