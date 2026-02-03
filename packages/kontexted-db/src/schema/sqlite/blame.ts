import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { notes } from "./note";
import { revisions } from "./revision";
import { users } from "./user";
import { sql } from "drizzle-orm";

export const noteLineBlame = sqliteTable(
  "note_line_blame",
  {
    noteId: integer("note_id").notNull().references(() => notes.id),
    lineNumber: integer("line_number").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id),
    revisionId: integer("revision_id")
      .notNull()
      .references(() => revisions.id),
    touchedAt: integer("touched_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.lineNumber] }),
    index("note_line_blame_note_idx").on(table.noteId),
  ]
);
