import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpTool } from "@/types";
import { logError } from "@/lib/logger";

// Tools that modify data
const WRITE_TOOLS = new Set(["createFolder", "createNote", "updateNoteContent", "deleteNote", "deleteFolder"]);

/**
 * Convert JSON schema to Zod schema, removing workspaceSlug
 */
function jsonSchemaToZod(jsonSchema: Record<string, unknown>): z.ZodObject<Record<string, z.ZodTypeAny>> {
  if (!jsonSchema || typeof jsonSchema !== "object") {
    return z.object({});
  }

  const properties = (jsonSchema.properties as Record<string, Record<string, unknown>>) ?? {};
  const required = new Set((jsonSchema.required as string[]) ?? []);

  // Remove workspaceSlug as it's injected by the proxy
  const { workspaceSlug, ...otherProperties } = properties;

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, propSchema] of Object.entries(otherProperties)) {
    const type = propSchema?.type;

    if (type === "string") {
      let zodType: z.ZodString = z.string();
      if (propSchema.minLength === 1) {
        zodType = zodType.min(1);
      }
      shape[key] = zodType;
    } else if (type === "integer") {
      let zodType: z.ZodNumber = z.number().int();
      if (propSchema.exclusiveMinimum === 0) {
        zodType = zodType.positive();
      }
      if (propSchema.minimum !== undefined) {
        zodType = zodType.min(propSchema.minimum as number);
      }
      if (propSchema.maximum !== undefined) {
        zodType = zodType.max(propSchema.maximum as number);
      }
      shape[key] = zodType;
    } else if (type === "number") {
      let zodType: z.ZodNumber = z.number();
      if (propSchema.minimum !== undefined) {
        zodType = zodType.min(propSchema.minimum as number);
      }
      if (propSchema.maximum !== undefined) {
        zodType = zodType.max(propSchema.maximum as number);
      }
      shape[key] = zodType;
    } else if (type === "boolean") {
      shape[key] = z.boolean();
    } else if (type === "array") {
      shape[key] = z.array(z.any());
    } else if (type === "object") {
      shape[key] = z.record(z.any());
    } else {
      shape[key] = z.any();
    }

    // Make optional if not in required list
    if (!required.has(key)) {
      shape[key] = shape[key].optional();
    }
  }

  return z.object(shape);
}

export interface ProxyOptions {
  client: Client;
  workspaceSlug: string;
  tools: McpTool[];
  writeEnabled: boolean;
}

/**
 * Start the MCP proxy server that bridges stdio to HTTP
 */
export async function startProxyServer(options: ProxyOptions): Promise<void> {
  const { client, workspaceSlug, tools, writeEnabled } = options;

  const server = new McpServer({
    name: "kontexted-proxy",
    version: "0.1.0",
  });

  // Filter and register tools
  const filteredTools = tools.filter((tool) => {
    if (writeEnabled) {
      return true;
    }
    return !WRITE_TOOLS.has(tool.name);
  });

  for (const tool of filteredTools) {
    const inputSchema = jsonSchemaToZod(tool.inputSchema ?? {});

    server.registerTool(
      tool.name,
      {
        title: tool.title ?? tool.name,
        description: tool.description ?? "",
        inputSchema,
      },
      async (args: Record<string, unknown>) => {
        // Inject workspaceSlug into arguments
        const finalArgs = {
          workspaceSlug,
          ...(args ?? {}),
        };

        const result = await client.callTool({
          name: tool.name,
          arguments: finalArgs,
        });

        // Convert old format (toolResult) to new format (content) if needed
        if ("toolResult" in result) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result.toolResult),
              },
            ],
            _meta: result._meta,
          } as const;
        }

        return result as never;
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logError(`Proxy server started with ${filteredTools.length} tools (${writeEnabled ? "write enabled" : "read-only"})`);

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    await client.close();
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await client.close();
    await server.close();
    process.exit(0);
  });
}
