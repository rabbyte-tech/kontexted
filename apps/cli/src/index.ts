import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { registerLoginCommand } from "@/commands/login";
import { registerReLoginCommand } from "@/commands/relogin";
import { registerLogoutCommand } from "@/commands/logout";
import { registerShowConfigCommand } from "@/commands/show-config";
import { registerMcpCommand } from "@/commands/mcp";
import { registerSkillCommand } from "@/commands/skill";
import { registerServerCommand } from "@/commands/server";
import { registerSyncCommand } from "@/commands/sync";

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

const program = new Command();

program
  .name("kontexted")
  .description("CLI tool for Kontexted - MCP proxy and workspace management")
  .version(packageJson.version);

// Register subcommands
registerLoginCommand(program);
registerReLoginCommand(program);
registerLogoutCommand(program);
registerShowConfigCommand(program);
registerSkillCommand(program);
registerMcpCommand(program);
registerServerCommand(program);
registerSyncCommand(program);

// Parse arguments
program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
