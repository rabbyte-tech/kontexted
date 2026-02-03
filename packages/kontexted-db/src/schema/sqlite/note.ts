import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";
import { folders } from "./folder";
import { workspaces } from "./workspace";
import { sql } from "drizzle-orm";

export const notes = sqliteTable(
  "notes",
  {
    id: integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
    publicId: text("public_id")
      .notNull()
      .unique()
      .$defaultFn(() => createId()),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    folderId: integer("folder_id").references(() => folders.id),
    name: text("name").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: integer({ mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
    updatedAt: integer({ mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
  },
  (table) => [
    index("notes_public_id_idx").on(table.publicId),
    index("notes_workspace_folder_idx").on(table.workspaceId, table.folderId),
    index("notes_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
  ]
);
