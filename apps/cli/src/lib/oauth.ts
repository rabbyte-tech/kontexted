import { createServer } from "node:http";
import { exec } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";
import type { OAuthState, OAuthTokens, OAuthClientInfo } from "@/types";
import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { logInfo, logDebug, logWarn, logError } from "@/lib/logger";

const CALLBACK_PORT = 8788;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;

const DEFAULT_CLIENT_METADATA: OAuthClientMetadata = {
  client_name: "Kontexted CLI",
  redirect_uris: [CALLBACK_URL],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};

/**
 * Open the user's browser to the authorization URL
 */
export function openBrowser(url: string): void {
  const platform = process.platform;
  const command =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  exec(command, async (error) => {
    if (error) {
      logError(`Failed to open browser: ${error.message}`);
      console.error(`Open this URL manually: ${url}`);
    }
  });
}

/**
 * Wait for OAuth callback on local server
 */
export function waitForOAuthCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.url === "/favicon.ico") {
        res.writeHead(404);
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url ?? "", "http://localhost");
      const code = parsedUrl.searchParams.get("code");
      const error = parsedUrl.searchParams.get("error");

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<p>Authorization complete. You can close this window.</p>");
        setTimeout(() => {
          server.closeAllConnections();
          server.close(() => resolve(code));
        }, 100);
        return;
      }

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<p>Authorization failed: ${error}</p>`);
        setTimeout(() => {
          server.closeAllConnections();
          server.close(() => reject(new Error(`OAuth authorization failed: ${error}`)));
        }, 100);
        return;
      }

      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing authorization code.");
      setTimeout(() => {
        server.closeAllConnections();
        server.close(() => reject(new Error("Missing authorization code.")));
      }, 100);
    });

    server.listen(CALLBACK_PORT, () => {
      console.log(`Waiting for OAuth callback on ${CALLBACK_URL}`);
    });
  });
}

/**
 * OAuth provider that interfaces with MCP SDK
 */
export interface OAuthProvider {
  readonly redirectUrl: string | URL;
  readonly clientMetadata: OAuthClientMetadata;
  clientInformation(): OAuthClientInfo | undefined | Promise<OAuthClientInfo | undefined>;
  saveClientInformation?(clientInformation: OAuthClientInfo): void | Promise<void>;
  tokens(): OAuthTokens | undefined | Promise<OAuthTokens | undefined>;
  saveTokens(tokens: OAuthTokens): void | Promise<void>;
  redirectToAuthorization(authorizationUrl: URL): void | Promise<void>;
  saveCodeVerifier(codeVerifier: string): void | Promise<void>;
  codeVerifier(): string | Promise<string>;
  invalidateCredentials?(scope: "all" | "tokens" | "client" | "verifier"): void | Promise<void>;
  getAuthorizationUrl(): Promise<URL>;
  exchangeCodeForToken(authCode: string): Promise<OAuthTokens>;
  refreshAccessToken(): Promise<OAuthTokens>;
  registerClient(): Promise<OAuthClientInfo>;
}

/**
 * Create an OAuth provider from stored state
 */
export function createOAuthProvider(
  oauth: OAuthState,
  persist: () => Promise<void>,
  serverUrl: string
): OAuthProvider {
  return {
    get redirectUrl() {
      return oauth?.redirectUrl ?? CALLBACK_URL;
    },

    get clientMetadata() {
      return (oauth?.clientMetadata as OAuthClientMetadata) ?? DEFAULT_CLIENT_METADATA;
    },

    clientInformation() {
      return oauth?.clientInformation;
    },

    saveClientInformation: async (clientInformation: OAuthClientInfo) => {
      oauth.clientInformation = clientInformation;
      await persist();
    },

    tokens() {
      return oauth?.tokens;
    },

    async saveTokens(tokens: OAuthTokens) {
      logDebug("saveTokens called", { 
        expiresIn: tokens.expires_in, 
        expiresAt: tokens.expires_at,
        hasRefreshToken: !!tokens.refresh_token,
      });
      
      // Calculate absolute expiry time if expires_in is provided
      if (tokens.expires_in && !tokens.expires_at) {
        tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
        logDebug("Calculated expires_at", { expiresAt: tokens.expires_at });
      }
      oauth.tokens = tokens;
      oauth.serverUrl = serverUrl;
      await persist();
      logInfo("Tokens saved successfully");
    },

    redirectToAuthorization(authorizationUrl: URL) {
      logDebug(`[OAUTH] Opening browser for OAuth at: ${authorizationUrl.toString()}`);
      openBrowser(authorizationUrl.toString());
    },

    async saveCodeVerifier(codeVerifier: string) {
      oauth.codeVerifier = codeVerifier;
      await persist();
    },

    codeVerifier() {
      if (!oauth?.codeVerifier) {
        throw new Error("Missing PKCE code verifier.");
      }
      return oauth.codeVerifier;
    },

    async invalidateCredentials(scope: "all" | "tokens" | "client" | "verifier") {
      if (!oauth) return;

      switch (scope) {
        case "all":
        case "tokens":
          delete oauth.tokens;
          if (scope === "tokens") break;
          // fallthrough for 'all'
        case "client":
          delete oauth.clientInformation;
          if (scope === "client") break;
          // fallthrough for 'all'
        case "verifier":
          delete oauth.codeVerifier;
          break;
      }
      await persist();
    },

    async getAuthorizationUrl(): Promise<URL> {
      const state = generateState();
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);

      // Store the code verifier for later token exchange
      await this.saveCodeVerifier(verifier);

      const baseUrl = new URL("/api/auth/oauth2/authorize", new URL(serverUrl).origin);
      baseUrl.searchParams.set("response_type", "code");
      baseUrl.searchParams.set("client_id", oauth.clientInformation?.client_id ?? "");
      baseUrl.searchParams.set("redirect_uri", this.redirectUrl.toString());
      baseUrl.searchParams.set("state", state);
      baseUrl.searchParams.set("code_challenge", challenge);
      baseUrl.searchParams.set("code_challenge_method", "S256");
      baseUrl.searchParams.set("resource", serverUrl);
      baseUrl.searchParams.set("scope", "openid profile email offline_access");

      return baseUrl;
    },

    async exchangeCodeForToken(authCode: string): Promise<OAuthTokens> {
      const verifier = await this.codeVerifier();
      const tokenUrl = new URL("/api/auth/oauth2/token", new URL(serverUrl).origin);

      logDebug(`[OAUTH] Exchanging code for token - URL: ${tokenUrl.toString()}`);

      const response = await fetch(tokenUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: authCode,
          redirect_uri: this.redirectUrl.toString(),
          client_id: oauth.clientInformation?.client_id ?? "",
          client_secret: oauth.clientInformation?.client_secret ?? "",
          code_verifier: verifier,
          resource: serverUrl,
        }),
      });

      logDebug(`[OAUTH] Token exchange response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        logError(`[OAUTH] Failed to exchange code for token - Status: ${response.status}, Error: ${errorText}`);
        throw new Error(`Failed to exchange code for token: ${response.status} ${errorText}`);
      }

      const tokens: OAuthTokens = (await response.json()) as OAuthTokens;
      logDebug("Token exchange response", {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in,
        expiresAt: tokens.expires_at,
        tokenType: tokens.token_type,
        scope: tokens.scope,
        fullResponse: JSON.stringify(tokens),
      });
      logDebug(`[OAUTH] Successfully exchanged code for token - Access token present: ${!!tokens.access_token}`);
      await this.saveTokens(tokens);

      return tokens;
    },

    async refreshAccessToken(): Promise<OAuthTokens> {
      const currentTokens = await this.tokens();
      if (!currentTokens?.refresh_token) {
        throw new Error("No refresh token available");
      }

      const tokenUrl = new URL("/api/auth/oauth2/token", new URL(serverUrl).origin);

      logDebug(`[OAUTH] Refreshing access token - URL: ${tokenUrl.toString()}`);

      const response = await fetch(tokenUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: currentTokens.refresh_token,
          client_id: oauth.clientInformation?.client_id ?? "",
          client_secret: oauth.clientInformation?.client_secret ?? "",
          resource: serverUrl,
        }),
      });

      logDebug(`[OAUTH] Token refresh response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        logError(`[OAUTH] Failed to refresh access token - Status: ${response.status}, Error: ${errorText}`);
        throw new Error(`Failed to refresh access token: ${response.status} ${errorText}`);
      }

      const tokens: OAuthTokens = (await response.json()) as OAuthTokens;
      logDebug(`[OAUTH] Successfully refreshed access token`);
      await this.saveTokens(tokens);

      return tokens;
    },

    async registerClient(): Promise<OAuthClientInfo> {
      const registerUrl = new URL("/api/auth/oauth2/register", new URL(serverUrl).origin);

      logDebug(`[OAUTH] Registering OAuth client - URL: ${registerUrl.toString()}`);

      const response = await fetch(registerUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.clientMetadata),
      });

      logDebug(`[OAUTH] Client registration response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        logError(`[OAUTH] Failed to register OAuth client - Status: ${response.status}, Error: ${errorText}`);
        throw new Error(`Failed to register OAuth client: ${response.status} ${errorText}`);
      }

      const clientInfo: OAuthClientInfo = (await response.json()) as OAuthClientInfo;
      logDebug(`[OAUTH] Successfully registered OAuth client - Client ID: ${clientInfo.client_id}`);
      if (this.saveClientInformation) {
        await this.saveClientInformation(clientInfo);
      }

      return clientInfo;
    },
  };
}

/**
 * Buffer time in seconds before token is considered expired
 * (refresh 5 minutes before actual expiry)
 */
const TOKEN_REFRESH_BUFFER_SECONDS = 30;

/**
 * Check if tokens need refresh and refresh them proactively
 * Uses refresh token (non-interactive) - no browser popup
 *
 * @returns true if tokens are valid (either already valid or successfully refreshed)
 */
export async function ensureValidTokens(
  oauth: OAuthState,
  persist: () => Promise<void>,
  serverUrl: string
): Promise<boolean> {
  const tokens = oauth.tokens;
  
  logDebug("ensureValidTokens called", {
    hasTokens: !!tokens,
    hasAccessToken: !!tokens?.access_token,
    hasRefreshToken: !!tokens?.refresh_token,
    expiresAt: tokens?.expires_at,
    expiresIn: tokens?.expires_in,
    currentTime: Math.floor(Date.now() / 1000),
    serverUrl,
  });

  // No tokens at all - need interactive login
  if (!tokens?.access_token) {
    logWarn("ensureValidTokens: No access token");
    return false;
  }
  
  // Check if token is still valid (with buffer)
  const now = Math.floor(Date.now() / 1000);
  const bufferTime = now + TOKEN_REFRESH_BUFFER_SECONDS;
  const isExpired = tokens.expires_at ? tokens.expires_at <= bufferTime : true;
  
  logDebug("Token expiry check", {
    expiresAt: tokens.expires_at,
    currentTime: now,
    bufferTime,
    isExpired,
  });

  if (tokens.expires_at && !isExpired) {
    logInfo("Access token still valid", { 
      expiresAt: tokens.expires_at, 
      remainingSeconds: tokens.expires_at - now 
    });
    return true;
  }
  
  // Token is expired or expiring soon - try to refresh
  if (!tokens.refresh_token) {
    logWarn("ensureValidTokens: Token expired and no refresh token available");
    return false;
  }
  
  logInfo("Access token expired or expiring soon, refreshing...", {
    expiresAt: tokens.expires_at,
    clientId: oauth.clientInformation?.client_id,
  });
  
  try {
    const tokenUrl = new URL("/api/auth/oauth2/token", new URL(serverUrl).origin);
    
    const requestBody = {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: oauth.clientInformation?.client_id ?? "",
      client_secret: oauth.clientInformation?.client_secret ?? "",
      resource: serverUrl,
    };
    
    logDebug("Sending refresh token request", { 
      url: tokenUrl.toString(),
      hasClientSecret: !!oauth.clientInformation?.client_secret,
    });
    
    const response = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(requestBody),
    });
    
    logDebug("Refresh token response", { 
      status: response.status,
      statusText: response.statusText,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logError("Token refresh failed", { 
        status: response.status, 
        error: errorText 
      });
      return false;
    }
    
    const newTokens = (await response.json()) as OAuthTokens;
    
    // Calculate absolute expiry time
    if (newTokens.expires_in && !newTokens.expires_at) {
      newTokens.expires_at = Math.floor(Date.now() / 1000) + newTokens.expires_in;
    }
    
    oauth.tokens = newTokens;
    await persist();
    
    logInfo("Token refresh successful", { 
      newExpiresAt: newTokens.expires_at,
      newExpiresIn: newTokens.expires_in,
    });
    return true;
  } catch (error) {
    logError("Error refreshing token", error);
    return false;
  }
}

function generateState(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
