import type { Command } from "commander";
import { readConfig, getConfigPath } from "@/lib/config";

/**
 * Register the show-config command
 */
export function registerShowConfigCommand(program: Command): void {
  program
    .command("show-config")
    .description("Display all stored profiles")
    .action(async () => {
      const config = await readConfig();
      
      console.log(`Config file: ${getConfigPath()}`);
      console.log("");
      
      if (Object.keys(config.profiles).length === 0) {
        console.log("No profiles configured.");
        return;
      }

      console.log(JSON.stringify(config, null, 2));
    });
}
