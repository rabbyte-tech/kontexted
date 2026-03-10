import { readConfig, writeConfig } from "@/lib/config";
import { getProfile } from "@/lib/profile";
import { ApiClient } from "@/lib/api-client";
import { ensureValidTokens } from "@/lib/oauth";
import type { Config, Profile, OAuthState } from "@/types";

/**
 * Create an authenticated API client with proper token validation and persistence.
 * This utility ensures tokens are validated/refreshed before creating the client
 * and uses deep copy to avoid reference issues when persisting tokens.
 *
 * @param profileAlias - The profile alias to authenticate with
 * @returns Object containing the authenticated ApiClient, config, and profile
 * @throws Error if profile not found or authentication expired
 */
export async function createAuthenticatedClient(
  profileAlias: string
): Promise<{ client: ApiClient; config: Config; profile: Profile }> {
  // Read config and get profile
  const config = await readConfig();
  const profile = getProfile(config, profileAlias);

  if (!profile) {
    throw new Error(`Profile not found: ${profileAlias}`);
  }

  // Create a persist callback that uses deep copy to avoid reference issues
  const createPersistCallback = () => {
    return async () => {
      const freshConfig = await readConfig();
      const freshProfile = getProfile(freshConfig, profileAlias);
      if (freshProfile) {
        // DEEP COPY the tokens to avoid reference issues
        // This is the fix for the persist callback bug
        freshProfile.oauth = {
          ...profile.oauth,
          tokens: profile.oauth.tokens ? { ...profile.oauth.tokens } : undefined,
        };
        await writeConfig(freshConfig);
      }
    };
  };

  // Create a single persist callback to be reused
  const persistCallback = createPersistCallback();

  // Proactively validate/refresh tokens before creating the client
  const tokensValid = await ensureValidTokens(
    profile.oauth,
    persistCallback,
    profile.serverUrl
  );

  if (!tokensValid) {
    throw new Error(
      `Authentication expired for ${profileAlias}. Run 'kontexted login --alias ${profileAlias}' to re-authenticate.`
    );
  }

  // Create the ApiClient with the same persist callback
  const client = new ApiClient(
    profile.serverUrl,
    profile.oauth,
    persistCallback
  );

  return { client, config, profile };
}
