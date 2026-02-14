import { Command } from "commander";
import { registerLoginCommand } from "@/commands/login";
import { registerLogoutCommand } from "@/commands/logout";
import { registerShowConfigCommand } from "@/commands/show-config";
import { registerMcpCommand } from "@/commands/mcp";
import { registerSkillCommand } from "@/commands/skill";
import { registerServerCommand } from "@/commands/server";

const program = new Command();

program
  .name("kontexted")
  .description("CLI tool for Kontexted - MCP proxy and workspace management")
  .version("0.1.0");

// Register subcommands
registerLoginCommand(program);
registerLogoutCommand(program);
registerShowConfigCommand(program);
registerSkillCommand(program);
registerMcpCommand(program);
registerServerCommand(program);

// Parse arguments
program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
