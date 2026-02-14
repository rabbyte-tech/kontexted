import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { URL } from "node:url";
import type { OAuthState } from "@/types";
import { createOAuthProvider, waitForOAuthCallback, ensureValidTokens, type OAuthProvider } from "@/lib/oauth";
import { logDebug, logWarn, logError } from "@/lib/logger";

/**
 * Connect to remote MCP server with OAuth authentication
 */
export async function connectRemoteClient(
  serverUrl: string,
  oauth: OAuthState,
  persist: () => Promise<void>,
  options: { allowInteractive: boolean }
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  // Construct MCP URL from base server URL
  const mcpUrl = `${serverUrl}/mcp`;
  logDebug(`[MCP CLIENT] Connecting to MCP server: ${mcpUrl}`);

  // Proactively refresh token if needed (non-interactive)
  const tokensValid = await ensureValidTokens(oauth, persist, serverUrl);

  if (!tokensValid) {
    logWarn(`[MCP CLIENT] Token refresh failed or no tokens available`);

    if (!options.allowInteractive) {
      throw new Error("Authentication required. Run 'kontexted login' to authenticate.");
    }
    // Will fall through to interactive OAuth flow below
  }

  const oauthProvider: OAuthProvider = createOAuthProvider(oauth, persist, serverUrl);

  const client = new Client({
    name: "kontexted-cli",
    version: "0.1.0",
  });

  const createTransport = () =>
    new StreamableHTTPClientTransport(new URL(mcpUrl), {
      authProvider: oauthProvider,
    });

  let transport = createTransport();

  try {
    logDebug(`[MCP CLIENT] Attempting initial connection...`);
    await client.connect(transport);
    logDebug(`[MCP CLIENT] Initial connection successful`);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      logWarn(`[MCP CLIENT] UnauthorizedError - authentication required`);

      if (!options.allowInteractive) {
        logError(`[MCP CLIENT] Interactive OAuth not allowed, throwing error`);
        throw error;
      }

      // Interactive OAuth flow
      logDebug(`[MCP CLIENT] Starting interactive OAuth flow...`);
      const authCode = await waitForOAuthCallback();
      await transport.finishAuth(authCode);
      await transport.close();

      // Reconnect with new tokens
      logDebug(`[MCP CLIENT] Reconnecting with new OAuth tokens...`);
      transport = createTransport();
      await client.connect(transport);
      logDebug(`[MCP CLIENT] Reconnection successful with OAuth tokens`);
    } else {
      logError(`[MCP CLIENT] Connection error:`, error);
      throw error;
    }
  }

  return { client, transport };
}

export { UnauthorizedError };
