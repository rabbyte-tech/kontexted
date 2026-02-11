import type { Command } from "commander";
import { readConfig, writeConfig, removeConfig } from "@/lib/config";
import { profileExists, removeProfile } from "@/lib/profile";

interface LogoutOptions {
  alias?: string;
}

/**
 * Register the logout command
 */
export function registerLogoutCommand(program: Command): void {
  program
    .command("logout")
    .description("Remove stored profiles")
    .option("--alias <name>", "Remove specific profile by alias")
    .action(async (options: LogoutOptions) => {
      const config = await readConfig();

      // No alias specified: remove all profiles
      if (!options.alias) {
        await removeConfig();
        console.log("✓ Removed all profiles.");
        return;
      }

      const profileKey = options.alias;

      if (!profileExists(config, profileKey)) {
        throw new Error(`Profile not found: ${profileKey}`);
      }

      removeProfile(config, profileKey);

      if (Object.keys(config.profiles).length === 0) {
        await removeConfig();
        console.log("✓ Removed last profile. Config file removed.");
      } else {
        await writeConfig(config);
        console.log(`✓ Removed profile: ${profileKey}`);
      }
    });
}
