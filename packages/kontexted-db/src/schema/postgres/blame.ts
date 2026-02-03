import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { notes } from "./note";
import { revisions } from "./revision";
import { users } from "./user";

export const noteLineBlame = pgTable(
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
    touchedAt: timestamp("touched_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.lineNumber] }),
    index("note_line_blame_note_idx").on(table.noteId),
  ]
);
