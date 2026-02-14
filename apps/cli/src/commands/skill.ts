import type { Command } from "commander";
import * as readline from "readline";
import { readConfig, writeConfig } from "@/lib/config";
import { getProfile } from "@/lib/profile";
import { ApiClient } from "@/lib/api-client";
import { ensureValidTokens } from "@/lib/oauth";
import { getProvider, allTemplates } from "@/skill-init/index";
import { initSkill } from "@/skill-init/utils";

/**
 * Execute workspace-tree skill via the API
 */
async function executeWorkspaceTree(
  client: ApiClient,
  workspaceSlug: string
): Promise<unknown> {
  const response = await client.post("/api/skill/workspace-tree", { workspaceSlug });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Workspace tree skill failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Execute search-notes skill via the API
 */
async function executeSearchNotes(
  client: ApiClient,
  workspaceSlug: string,
  query: string,
  limit?: number
): Promise<unknown> {
  const body: Record<string, unknown> = { workspaceSlug, query };
  if (limit !== undefined) {
    body.limit = limit;
  }

  const response = await client.post("/api/skill/search-notes", body);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Search notes skill failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Execute note-by-id skill via the API
 */
async function executeNoteById(
  client: ApiClient,
  workspaceSlug: string,
  notePublicId: string
): Promise<unknown> {
  const response = await client.post("/api/skill/note-by-id", {
    workspaceSlug,
    notePublicId
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Note by ID skill failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Helper function to create an API client from a profile alias
 */
async function createApiClient(alias: string): Promise<ApiClient> {
  const config = await readConfig();
  const profile = getProfile(config, alias);

  if (!profile) {
    console.error(
      `Profile not found: ${alias}. Run 'kontexted login' first.`
    );
    process.exit(1);
  }

  // Proactively refresh token if needed (non-interactive)
  const tokensValid = await ensureValidTokens(
    profile.oauth,
    async () => writeConfig(config),
    profile.serverUrl
  );

  if (!tokensValid) {
    console.error(
      `Authentication expired. Run 'kontexted login --alias ${alias}' to re-authenticate.`
    );
    process.exit(1);
  }

  return new ApiClient(
    profile.serverUrl,
    profile.oauth,
    async () => writeConfig(config)
  );
}

/**
 * Display results from a skill execution
 */
function displayResult(result: unknown): void {
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Register the skill command and its subcommands
 */
export function registerSkillCommand(program: Command): void {
  const skillCommand = program
    .command("skill")
    .description("Invoke LLM skill via CLI");

  skillCommand
    .command("workspace-tree")
    .description("Get the workspace tree structure")
    .requiredOption("--alias <name>", "Profile alias to use")
    .action(async (options) => {
      try {
        const client = await createApiClient(options.alias);
        const config = await readConfig();
        const profile = getProfile(config, options.alias);

        if (!profile) {
          console.error(
            `Profile not found: ${options.alias}. Run 'kontexted login' first.`
          );
          process.exit(1);
        }

        const result = await executeWorkspaceTree(client, profile.workspace);
        displayResult(result);
      } catch (error) {
        console.error(
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  skillCommand
    .command("search-notes")
    .description("Search notes by query in a workspace")
    .requiredOption("--alias <name>", "Profile alias to use")
    .requiredOption("--query <text>", "Search query")
    .option("--limit <number>", "Maximum number of results (default: 20, max: 50)", parseInt)
    .action(async (options) => {
      try {
        const client = await createApiClient(options.alias);
        const config = await readConfig();
        const profile = getProfile(config, options.alias);

        if (!profile) {
          console.error(
            `Profile not found: ${options.alias}. Run 'kontexted login' first.`
          );
          process.exit(1);
        }

        const result = await executeSearchNotes(
          client,
          profile.workspace,
          options.query,
          options.limit
        );
        displayResult(result);
      } catch (error) {
        console.error(
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  skillCommand
    .command("note-by-id")
    .description("Get a specific note by its public ID")
    .requiredOption("--alias <name>", "Profile alias to use")
    .requiredOption("--note-id <id>", "Public ID of the note")
    .action(async (options) => {
      try {
        const client = await createApiClient(options.alias);
        const config = await readConfig();
        const profile = getProfile(config, options.alias);

        if (!profile) {
          console.error(
            `Profile not found: ${options.alias}. Run 'kontexted login' first.`
          );
          process.exit(1);
        }

        const result = await executeNoteById(
          client,
          profile.workspace,
          options.noteId
        );
        displayResult(result);
      } catch (error) {
        console.error(
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  skillCommand
    .command("init")
    .description("Initialize AI agent skills for the current project")
    .option("--provider <name>", "Provider to use (default: opencode)", "opencode")
    .option("--all", "Generate all available skills without prompting", false)
    .action(async (options) => {
      try {
        // Get the provider
        let provider;
        try {
          provider = getProvider(options.provider);
        } catch {
          console.error(`Unknown skill provider: ${options.provider}`);
          console.error(`Available providers: ${["opencode"].join(", ")}`);
          process.exit(1);
        }

        // Show what will be generated
        console.log(`This will generate the following skills for ${provider.name}:`);
        for (const template of allTemplates) {
          const skillPath = provider.getSkillPath(template.name);
          console.log(`  - ${template.name} → ${skillPath}`);
        }

        // Check if we should prompt for confirmation
        if (!options.all) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question("\nContinue? (y/N) ", (response) => {
              rl.close();
              resolve(response);
            });
          });

          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            process.exit(0);
          }
        }

        // Generate all skills
        const results: Array<{ name: string; path: string; created: boolean }> = [];

        for (const template of allTemplates) {
          console.log(`Generating skill: ${template.name}`);

          const result = await initSkill({
            skill: template,
            provider,
          });

          const status = result.created ? "Created" : "Updated";
          console.log(`✓ ${status} ${result.path}`);
          results.push({
            name: result.name,
            path: result.path,
            created: result.created,
          });
        }

        // Show summary
        const created = results.filter((r) => r.created).length;
        const updated = results.length - created;
        console.log(`\nSummary: ${created} created, ${updated} updated`);

      } catch (error) {
        console.error(
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });
}
