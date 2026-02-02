import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, keycloak, mcp } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { db } from "@/db";
import {
  accounts,
  oauthAccessTokens,
  oauthApplications,
  oauthConsents,
  sessions,
  users,
  verifications,
} from "@kontexted/db";

const keycloakConfigured = !!(
  process.env.AUTH_KEYCLOAK_ID &&
  process.env.AUTH_KEYCLOAK_SECRET &&
  process.env.AUTH_KEYCLOAK_ISSUER
);

const authMethod = process.env.AUTH_METHOD || (keycloakConfigured ? "keycloak" : "email-password");

if (authMethod === "keycloak" && !keycloakConfigured) {
  console.warn("AUTH_METHOD=keycloak but Keycloak vars missing; falling back to email/password");
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      account: accounts,
      session: sessions,
      verification: verifications,
      oauthApplication: oauthApplications,
      oauthAccessToken: oauthAccessTokens,
      oauthConsent: oauthConsents,
    },
  }),
  emailAndPassword: {
    enabled: authMethod !== "keycloak",
    autoSignIn: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" && ctx.method === "POST") {
        const configuredInviteCode = process.env.INVITE_CODE;

        if (!configuredInviteCode) {
          return ctx.json({ error: "Sign up is not available" }, { status: 400 });
        }

        const inviteCode = (ctx.body as { inviteCode: string | undefined })?.inviteCode;

        if (configuredInviteCode && inviteCode !== configuredInviteCode) {
          return ctx.json({ error: "Invalid invite code" }, { status: 400 });
        }
      }
    }),
  },
  plugins: [
    ...(authMethod === "keycloak" ? [genericOAuth({
      config: [
        keycloak({
          clientId: process.env.AUTH_KEYCLOAK_ID || "",
          clientSecret: process.env.AUTH_KEYCLOAK_SECRET || "",
          issuer: process.env.AUTH_KEYCLOAK_ISSUER || "",
        }),
      ],
    })] : []),
    mcp({
      loginPage: "/",
    }),
    nextCookies(),
  ],
});
