import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { folders } from "./folder";
import { workspaces } from "./workspace";

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("notes_public_id_idx").on(table.publicId),
    index("notes_workspace_folder_idx").on(table.workspaceId, table.folderId),
    index("notes_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
  ]
);
