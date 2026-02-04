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
    type: text("type").notNull(),
    name: text("name").notNull(),
    icon: text("icon"),
    metadata: text("metadata"),
    redirectUrls: text("redirectUrls").notNull(),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
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
    accessToken: text("accessToken").notNull(),
    refreshToken: text("refreshToken").notNull(),
    accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }).notNull(),
    refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }).notNull(),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthApplications.clientId, { onDelete: "cascade" }),
    userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("oauth_access_token_value_idx").on(table.accessToken),
    uniqueIndex("oauth_refresh_token_value_idx").on(table.refreshToken),
    index("oauth_access_token_client_id_idx").on(table.clientId),
    index("oauth_access_token_user_id_idx").on(table.userId),
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
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    consentGiven: integer("consentGiven", { mode: "boolean" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("oauth_consent_client_id_idx").on(table.clientId),
    index("oauth_consent_user_id_idx").on(table.userId),
  ]
);
