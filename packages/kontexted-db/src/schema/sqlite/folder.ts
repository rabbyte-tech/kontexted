import { foreignKey, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { workspaces } from "./workspace";

export const folders = sqliteTable(
  "folders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id")
      .notNull()
      .unique()
      .$defaultFn(() => createId()),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    parentId: integer("parent_id"),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  },
  (table) => [
    index("folders_public_id_idx").on(table.publicId),
    index("folders_workspace_parent_idx").on(table.workspaceId, table.parentId),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
    }),
  ]
);
