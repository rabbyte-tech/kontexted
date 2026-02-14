import { randomUUID } from "crypto";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const accounts = sqliteTable("account", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const sessions = sqliteTable("session", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const verifications = sqliteTable("verification", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const oauthApplications = sqliteTable(
  "oauthApplication",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    clientId: text("clientId").notNull().unique(),
    clientSecret: text("clientSecret"),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    skipConsent: integer("skipConsent", { mode: "boolean" }),
    enableEndSession: integer("enableEndSession", { mode: "boolean" }),
    scopes: text("scopes"),
    userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
    name: text("name").notNull(),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts"),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("softwareId"),
    softwareVersion: text("softwareVersion"),
    softwareStatement: text("softwareStatement"),
    redirectUris: text("redirectUris").notNull(),
    postLogoutRedirectUris: text("postLogoutRedirectUris"),
    tokenEndpointAuthMethod: text("tokenEndpointAuthMethod"),
    grantTypes: text("grantTypes"),
    responseTypes: text("responseTypes"),
    public: integer("public", { mode: "boolean" }),
    type: text("type"),
    referenceId: text("referenceId"),
    metadata: text("metadata"),
  },
  (table) => [
    index("oauth_application_user_id_idx").on(table.userId),
  ]
);

export const oauthAccessTokens = sqliteTable(
  "oauthAccessToken",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    token: text("token").notNull(),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthApplications.clientId, { onDelete: "cascade" }),
    sessionId: text("sessionId").references(() => sessions.id, { onDelete: "set null" }),
    userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    refreshId: text("refreshId").references(() => oauthRefreshTokens.id, { onDelete: "set null" }),
    expiresAt: integer("expiresAt", { mode: "timestamp" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
    scopes: text("scopes").notNull(),
  },
  (table) => [
    uniqueIndex("oauth_access_token_token_unique").on(table.token),
    index("oauth_access_token_client_id_idx").on(table.clientId),
    index("oauth_access_token_user_id_idx").on(table.userId),
    index("oauth_access_token_session_id_idx").on(table.sessionId),
  ]
);

export const oauthConsents = sqliteTable(
  "oauthConsent",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthApplications.clientId, { onDelete: "cascade" }),
    userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    scopes: text("scopes").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("oauth_consent_client_id_idx").on(table.clientId),
    index("oauth_consent_user_id_idx").on(table.userId),
  ]
);

export const oauthRefreshTokens = sqliteTable(
  "oauthRefreshToken",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    token: text("token").notNull().unique(),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthApplications.clientId, { onDelete: "cascade" }),
    sessionId: text("sessionId").references(() => sessions.id, { onDelete: "set null" }),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    expiresAt: integer("expiresAt", { mode: "timestamp" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
    revoked: integer("revoked", { mode: "timestamp" }),
    scopes: text("scopes").notNull(),
  },
  (table) => [
    index("oauth_refresh_token_client_id_idx").on(table.clientId),
    index("oauth_refresh_token_user_id_idx").on(table.userId),
    index("oauth_refresh_token_session_id_idx").on(table.sessionId),
  ]
);

export const jwks = sqliteTable(
  "jwks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    publicKey: text("publicKey").notNull(),
    privateKey: text("privateKey").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
    expiresAt: integer("expiresAt", { mode: "timestamp" }),
  }
);
