import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { genericOAuth, keycloak, mcp } from "better-auth/plugins";
import { db, dialect } from "@/db";
import {
  users,
  accounts,
  sessions,
  verifications,
  oauthApplications,
  oauthAccessTokens,
  oauthConsents,
} from "@/db/schema";

// Get auth base URL from environment or config
function getAuthBaseURL(): string {
  // Priority 1: BETTER_AUTH_URL env var (for production/reverse proxy scenarios)
  if (process.env.BETTER_AUTH_URL) {
    console.log(`[auth] Using BETTER_AUTH_URL: ${process.env.BETTER_AUTH_URL}`);
    return process.env.BETTER_AUTH_URL;
  }
  
  // Priority 2: Construct from server config (default for local dev)
  const config = global.KONTEXTED_CONFIG || {
    server: {
      host: process.env.HOST || 'localhost',
      port: parseInt(process.env.PORT || '4242', 10),
    },
  };
  const baseURL = `http://${config.server.host}:${config.server.port}`;
  console.log(`[auth] Using config-based URL: ${baseURL}`);
  return baseURL;
}

const baseURL = getAuthBaseURL();

const authMethod = process.env.AUTH_METHOD || "email-password";

const plugins: any[] = [
  mcp({
    loginPage: "/",
  }),
];

if (authMethod === "keycloak") {
  const keycloakId = process.env.AUTH_KEYCLOAK_ID;
  const keycloakSecret = process.env.AUTH_KEYCLOAK_SECRET;
  const keycloakIssuer = process.env.AUTH_KEYCLOAK_ISSUER;

  if (keycloakId && keycloakSecret && keycloakIssuer) {
    plugins.push(
      genericOAuth({
        config: [
          keycloak({
            clientId: keycloakId,
            clientSecret: keycloakSecret,
            issuer: keycloakIssuer,
          }),
        ],
      })
    );
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: dialect === "sqlite" ? "sqlite" : "pg",
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
  baseURL,
  emailAndPassword: {
    enabled: authMethod !== "keycloak",
    autoSignIn: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" && ctx.method === "POST") {
        const inviteCode = process.env.INVITE_CODE;
        if (!inviteCode) {
          return ctx.json(
            { error: "Sign up is not available" },
            { status: 400 }
          );
        }
        if (!ctx.request) {
          return ctx.json(
            { error: "Invalid request" },
            { status: 400 }
          );
        }
        const body = ctx.body;
        if (typeof body !== 'object' || body === null || Array.isArray(body) || !('inviteCode' in body) || body.inviteCode !== inviteCode) {
          return ctx.json(
            { error: "Invalid invite code" },
            { status: 400 }
          );
        }
      }
    }),
  },
  plugins,
});
