import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { notes } from "./note";
import { users } from "./user";
import { workspaces } from "./workspace";

export const revisions = pgTable(
  "revisions",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    noteId: integer("note_id").notNull().references(() => notes.id),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("revisions_note_created_idx").on(table.noteId, table.createdAt),
  ]
);
