import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { notes } from "./note";
import { users } from "./user";
import { workspaces } from "./workspace";

export const revisions = sqliteTable(
  "revisions",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    noteId: integer("note_id").notNull().references(() => notes.id),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  },
  (table) => [
    index("revisions_note_created_idx").on(table.noteId, table.createdAt),
  ]
);
