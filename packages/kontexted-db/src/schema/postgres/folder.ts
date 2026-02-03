import { foreignKey, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { workspaces } from "./workspace";

export const folders = pgTable(
  "folders",
  {
    id: serial("id").primaryKey(),
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
