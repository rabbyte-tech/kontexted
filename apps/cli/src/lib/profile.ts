import type { Config, Profile } from "@/types";

/**
 * Get a profile by alias
 * @param config - The configuration object
 * @param alias - The profile alias to look up
 * @returns The profile if found, null otherwise
 */
export function getProfile(config: Config, alias: string): Profile | null {
  if (!config.profiles[alias]) {
    return null;
  }
  return config.profiles[alias];
}

/**
 * Add or update a profile by alias
 * @param config - The configuration object
 * @param alias - The profile alias
 * @param profile - The profile data to store
 */
export function addProfile(config: Config, alias: string, profile: Profile): void {
  config.profiles[alias] = profile;
}

/**
 * Remove a profile by alias
 * @param config - The configuration object
 * @param alias - The profile alias to remove
 */
export function removeProfile(config: Config, alias: string): void {
  delete config.profiles[alias];
}

/**
 * List all profiles with their aliases
 * @param config - The configuration object
 * @returns Array of profile entries with alias and profile data
 */
export function listProfiles(
  config: Config
): Array<{ alias: string; profile: Profile }> {
  return Object.entries(config.profiles).map(([alias, profile]) => ({
    alias,
    profile,
  }));
}

/**
 * Check if a profile exists by alias
 * @param config - The configuration object
 * @param alias - The profile alias to check
 * @returns True if the profile exists, false otherwise
 */
export function profileExists(config: Config, alias: string): boolean {
  return alias in config.profiles;
}
