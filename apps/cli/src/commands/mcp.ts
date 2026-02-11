import type { Command } from "commander";
import { readConfig, writeConfig } from "@/lib/config";
import { getProfile } from "@/lib/profile";
import { connectRemoteClient, UnauthorizedError } from "@/lib/mcp-client";
import { startProxyServer } from "@/lib/proxy-server";

interface McpOptions {
  alias?: string;
  write?: boolean;
  writeOff?: boolean;
}

/**
 * Start the MCP proxy server
 */
async function startMcpProxy(options: McpOptions): Promise<void> {
  const config = await readConfig();

  const profileKey = options.alias;
  if (!profileKey) {
    throw new Error(
      "Missing --alias. Required for MCP proxy mode.\n" +
        "Run 'kontexted mcp --help' for usage information."
    );
  }

  if (options.write && options.writeOff) {
    throw new Error("Cannot specify both --write and --write-off");
  }

  const profile = getProfile(config, profileKey);
  if (!profile) {
    throw new Error(
      `Profile not found: ${profileKey}. Run 'kontexted login' first.`
    );
  }

  // Determine write mode
  let writeEnabled = profile.write ?? false;
  if (options.write) {
    writeEnabled = true;
  } else if (options.writeOff) {
    writeEnabled = false;
  }

  const persist = async () => {
    await writeConfig(config);
  };

  try {
    const { client } = await connectRemoteClient(
      profile.serverUrl,
      profile.oauth,
      persist,
      { allowInteractive: false }
    );

    const toolList = await client.listTools();

    await startProxyServer({
      client,
      workspaceSlug: profile.workspace,
      tools: toolList.tools,
      writeEnabled,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      console.error("Error: Unauthorized. Run 'kontexted login' first.");
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Register the MCP proxy command
 */
export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("Start MCP proxy server")
    .requiredOption("--alias <name>", "Profile alias to use")
    .option("--write", "Override to enable write operations")
    .option("--write-off", "Override to disable write operations")
    .action(async (options: McpOptions) => {
      await startMcpProxy(options);
    });
}

export { startMcpProxy };
