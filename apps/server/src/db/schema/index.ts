import * as pgSchema from "./postgresql/index";
import * as sqliteSchema from "./sqlite/index";

// Get config from global or fallback to env (same logic as db.ts)
function getConfig() {
  if (global.KONTEXTED_CONFIG) {
    return global.KONTEXTED_CONFIG;
  }

  // Fallback for direct imports before config is set
  return {
    database: {
      dialect: (process.env.DATABASE_DIALECT || 'sqlite') as 'sqlite' | 'postgresql',
      url: process.env.DATABASE_URL || './data/kontexted.db',
    },
  };
}

const config = getConfig();
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
