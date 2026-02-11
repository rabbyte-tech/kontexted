import type { Command } from "commander";
import { readConfig, writeConfig } from "@/lib/config";
import { addProfile } from "@/lib/profile";
import { resolveServerUrl } from "@/lib/server-url";
import { createOAuthProvider, waitForOAuthCallback } from "@/lib/oauth";
import type { OAuthState } from "@/types";
import { logDebug } from "@/lib/logger";

interface LoginOptions {
  url: string;
  alias: string;
  workspace: string;
  write?: boolean;
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Authenticate and store a new profile")
    .requiredOption("--url <url>", "Kontexted server URL (e.g. https://app.example.com or app.example.com)")
    .requiredOption("--alias <name>", "Profile alias")
    .requiredOption("--workspace <slug>", "Workspace slug")
    .option("--write", "Enable write operations for this profile by default", false)
    .action(async (options: LoginOptions) => {
      const baseUrl = resolveServerUrl(options.url);
      logDebug(`[LOGIN] Starting login flow - URL: ${baseUrl}, Alias: ${options.alias}, Workspace: ${options.workspace}`);

      const config = await readConfig();
      const oauth: OAuthState = {};

      const persist = async () => {
        await writeConfig(config);
      };

      // Create OAuth provider
      const provider = createOAuthProvider(oauth, persist, baseUrl);

      // 1. Register OAuth client
      logDebug(`[LOGIN] Registering OAuth client...`);
      await provider.registerClient();

      // 2. Get authorization URL and open browser
      const authUrl = await provider.getAuthorizationUrl();
      logDebug(`[LOGIN] Opening browser for authorization...`);
      provider.redirectToAuthorization(authUrl);

      // 3. Wait for callback with auth code
      logDebug(`[LOGIN] Waiting for authorization callback...`);
      const authCode = await waitForOAuthCallback();

      // 4. Exchange code for tokens
      logDebug(`[LOGIN] Exchanging authorization code for tokens...`);
      await provider.exchangeCodeForToken(authCode);

      // Store the profile
      const profile = {
        serverUrl: baseUrl,
        workspace: options.workspace,
        write: options.write ?? false,
        oauth,
      };

      addProfile(config, options.alias, profile);
      await writeConfig(config);

      console.log(`✓ Login successful. Profile stored as: ${options.alias}`);
    });
}
