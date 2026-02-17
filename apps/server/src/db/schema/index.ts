import * as pgSchema from "./postgresql/index";
import * as sqliteSchema from "./sqlite/index";
import { config } from "@/config";

const dialect = config.database.dialect;
const schema = (dialect === "sqlite" ? sqliteSchema : pgSchema) as typeof pgSchema;

export { schema };
export const {
  users,
  accounts,
  sessions,
  verifications,
  oauthApplications,
  oauthAccessTokens,
  oauthRefreshTokens,
  oauthConsents,
  jwks,
  workspaces,
  folders,
  notes,
  revisions,
  noteLineBlame,
} = schema;
