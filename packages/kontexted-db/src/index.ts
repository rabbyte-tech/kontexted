import * as pgSchema from "./schema/postgres"
import * as sqliteSchema from "./schema/sqlite"

const dialect = process.env.DATABASE_DIALECT === "sqlite" ? "sqlite" : "postgresql"
const schema = (dialect === "sqlite" ? sqliteSchema : pgSchema) as typeof pgSchema

export { schema };
export const {
  users,
  accounts,
  sessions,
  verifications,
  oauthApplications,
  oauthAccessTokens,
  oauthConsents,
  workspaces,
  folders,
  notes,
  revisions,
  noteLineBlame,
} = schema;
