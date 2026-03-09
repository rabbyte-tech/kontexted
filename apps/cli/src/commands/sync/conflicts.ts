import type { Command } from "commander";
import { registerConflictsListCommand } from "./conflicts/list";
import { registerConflictsShowCommand } from "./conflicts/show";
import { registerConflictsResolveCommand } from "./conflicts/resolve";

// Yargs-style exports
export const command = "conflicts";
export const desc = "Manage sync conflicts";

// For backward compatibility with index.ts
export const conflictsCmd = {
  command,
  desc,
};

/**
 * Register the sync conflicts command with its subcommands.
 */
export function registerConflictsCommand(syncCommand: Command): void {
  const conflictsSubCmd = syncCommand.command("conflicts").description(desc);

  registerConflictsListCommand(conflictsSubCmd);
  registerConflictsShowCommand(conflictsSubCmd);
  registerConflictsResolveCommand(conflictsSubCmd);
}
