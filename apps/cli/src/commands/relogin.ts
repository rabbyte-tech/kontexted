import type { Command } from "commander";
import { readConfig, writeConfig } from "@/lib/config";
import { getProfile, addProfile } from "@/lib/profile";
import { createOAuthProvider, waitForOAuthCallback } from "@/lib/oauth";
import type { OAuthState } from "@/types";
import { logDebug } from "@/lib/logger";

interface ReLoginOptions {
  alias: string;
}

export function registerReLoginCommand(program: Command): void {
  program
    .command("relogin")
    .description("Re-authenticate an existing profile to refresh tokens")
    .requiredOption("--alias <name>", "Profile alias to re-authenticate")
    .action(async (options: ReLoginOptions) => {
      // Read existing config
      const config = await readConfig();
      const existingProfile = getProfile(config, options.alias);

      if (!existingProfile) {
        throw new Error(
          `Profile not found: ${options.alias}. Use 'kontexted login --url <url> --alias ${options.alias} --workspace <slug>' to create a new profile.`
        );
      }

      const serverUrl = existingProfile.serverUrl;
      logDebug(`[RELOGIN] Starting re-auth flow - Alias: ${options.alias}, Server: ${serverUrl}`);

      // Create a new OAuth state that preserves client information from existing profile
      const oauth: OAuthState = {
        clientInformation: existingProfile.oauth?.clientInformation,
        clientMetadata: existingProfile.oauth?.clientMetadata,
      };

      const persist = async () => {
        // Update the profile in config with new OAuth state
        const updatedProfile = {
          ...existingProfile,
          oauth,
        };
        addProfile(config, options.alias, updatedProfile);
        await writeConfig(config);
      };

      // Create OAuth provider with existing client info
      const provider = createOAuthProvider(oauth, persist, serverUrl);

      // 1. If no client information exists, register a new OAuth client
      if (!oauth.clientInformation) {
        logDebug(`[RELOGIN] No existing client information, registering new OAuth client...`);
        await provider.registerClient();
      } else {
        logDebug(`[RELOGIN] Using existing client information: ${oauth.clientInformation.client_id}`);
      }

      // 2. Get authorization URL and open browser
      const authUrl = await provider.getAuthorizationUrl();
      logDebug(`[RELOGIN] Opening browser for authorization...`);
      provider.redirectToAuthorization(authUrl);

      // 3. Wait for callback with auth code
      logDebug(`[RELOGIN] Waiting for authorization callback...`);
      const authCode = await waitForOAuthCallback();

      // 4. Exchange code for tokens
      logDebug(`[RELOGIN] Exchanging authorization code for tokens...`);
      await provider.exchangeCodeForToken(authCode);

      console.log(`✓ Re-authentication successful. Tokens refreshed for profile: ${options.alias}`);
    });
}
