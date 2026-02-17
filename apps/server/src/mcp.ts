import { mcpHandler } from "@better-auth/oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { db, dialect } from "@/db";
import { notes, folders } from "@/db/schema";
import { and, eq, ilike, or, asc, sql } from "drizzle-orm";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveNoteId } from "@/lib/resolvers";
import { getAuthBaseUrl } from "@/lib/auth-utils";
import { getWorkspaceTree, type FolderNode, type WorkspaceTree } from "@/lib/workspace-tree";
import {
  type NoteSummary,
  type FolderNodeWithPublicId,
  type WorkspaceTreeWithPublicId,
  transformFolderTree,
  transformWorkspaceTree,
} from "@/lib/workspace-tree-transform";
import {
  createFolderInWorkspace,
  createNoteInWorkspace,
  updateNoteContentInWorkspace,
  ValidationError,
  NotFoundError,
  DuplicateError,
} from "@/lib/write-operations";


/**
 * Case-insensitive LIKE that works with both PostgreSQL and SQLite
 */
function caseInsensitiveLike(column: unknown, pattern: string) {
  if (dialect === "sqlite") {
    return sql`LOWER(${column}) LIKE LOWER(${pattern})`;
  }
  return ilike(column as any, pattern);
}

// Note summary schema for MCP tools
const noteSummarySchema = z.object({
  publicId: z.string(),
  name: z.string(),
  title: z.string(),
  folderPublicId: z.string().nullable(),
});

// Folder schema for MCP tools
const folderSchemaBase = z.object({
  publicId: z.string(),
  name: z.string(),
  displayName: z.string(),
  parentPublicId: z.string().nullable(),
  notes: z.array(noteSummarySchema),
});

type FolderSchemaOutput = z.infer<typeof folderSchemaBase> & {
  children: FolderSchemaOutput[];
};

const folderSchema: z.ZodType<FolderSchemaOutput> = z.lazy(() =>
  folderSchemaBase.extend({
    children: z.array(folderSchema),
  })
);

// Workspace tree schema
const workspaceTreeSchema = z.object({
  workspaceSlug: z.string(),
  workspaceName: z.string(),
  rootNotes: z.array(noteSummarySchema),
  folders: z.array(folderSchema),
});

// Note schema
const noteSchema = z.object({
  publicId: z.string(),
  name: z.string(),
  title: z.string(),
  content: z.string(),
  folderPublicId: z.string().nullable(),
  updatedAt: z.string(),
});

const searchNotesSchema = z.object({
  matches: z.array(noteSummarySchema),
});


// Factory function to create a new MCP server per request (stateless mode)
const getServer = () => {
  const server = new McpServer({
    name: 'kontexted-mcp-server',
    version: '1.0.0'
  });

  // Register getWorkspaceTree tool
  server.registerTool('getWorkspaceTree', {
    title: 'Get Workspace Tree',
    description: 'Get the complete workspace tree with folders and notes',
    inputSchema: {
      workspaceSlug: z.string().describe('The slug of the workspace')
    }
  }, async ({ workspaceSlug }: { workspaceSlug: string }) => {
    const workspaceSlugValue = parseSlug(workspaceSlug);
    if (!workspaceSlugValue) {
      return {
        content: [{ type: 'text', text: 'Invalid workspace slug.' }],
        isError: true,
      };
    }

    const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
    if (!workspaceIdValue) {
      return {
        content: [{ type: 'text', text: 'Workspace not found.' }],
        isError: true,
      };
    }

    const tree = await getWorkspaceTree(workspaceIdValue);

    if (!tree) {
      return {
        content: [{ type: 'text', text: 'Workspace not found.' }],
        isError: true,
      };
    }

    const transformedTree = transformWorkspaceTree(tree, workspaceSlugValue);

    return {
      content: [
        { type: 'text', text: `Loaded tree for workspace ${workspaceSlug}.` },
        { type: 'text', text: JSON.stringify({ tree: transformedTree }, null, 2) },
      ],
      structuredContent: { tree: transformedTree },
    };
  });

  // Register searchNotesByQuery tool
  server.registerTool('searchNotesByQuery', {
    title: 'Search Notes',
    description: 'Search notes by query in a workspace',
    inputSchema: {
      workspaceSlug: z.string().describe('The slug of the workspace'),
      query: z.string().min(1).describe('Search query'),
      limit: z.number().int().positive().max(50).optional().describe('Maximum number of results (default: 20)')
    }
  }, async ({ workspaceSlug, query, limit }: { workspaceSlug: string; query: string; limit?: number }) => {
    const workspaceSlugValue = parseSlug(workspaceSlug);
    if (!workspaceSlugValue) {
      return {
        content: [{ type: 'text', text: 'Invalid workspace slug.' }],
        isError: true,
      };
    }

    const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
    if (!workspaceIdValue) {
      return {
        content: [{ type: 'text', text: 'Workspace not found.' }],
        isError: true,
      };
    }

    const pattern = `%${query.trim()}%`;
    const rows = await db
      .select({
        id: notes.id,
        publicId: notes.publicId,
        name: notes.name,
        title: notes.title,
        folderId: notes.folderId,
        folderPublicId: folders.publicId,
      })
      .from(notes)
      .leftJoin(folders, eq(notes.folderId, folders.id))
      .where(
        and(
          eq(notes.workspaceId, workspaceIdValue),
          or(caseInsensitiveLike(notes.title, pattern), caseInsensitiveLike(notes.name, pattern))
        )
      )
      .orderBy(asc(notes.title))
      .limit(limit ?? 20);

    const matches = rows.map((row) => ({
      publicId: row.publicId,
      name: row.name,
      title: row.title,
      folderPublicId: row.folderPublicId ?? null,
    }));

    return {
      content: [
        { type: 'text', text: `Found ${matches.length} matching notes.` },
        { type: 'text', text: JSON.stringify({ matches }, null, 2) },
      ],
      structuredContent: { matches },
    };
  });

  // Register getNoteById tool
  server.registerTool('getNoteById', {
    title: 'Get Note by ID',
    description: 'Get a specific note by its public ID',
    inputSchema: {
      workspaceSlug: z.string().describe('The slug of the workspace'),
      notePublicId: z.string().describe('The public ID of the note')
    }
  }, async ({ workspaceSlug, notePublicId }: { workspaceSlug: string; notePublicId: string }) => {
    const workspaceSlugValue = parseSlug(workspaceSlug);
    if (!workspaceSlugValue) {
      return {
        content: [{ type: 'text', text: 'Invalid workspace slug.' }],
        isError: true,
      };
    }

    const notePublicIdValue = parsePublicId(notePublicId);
    if (!notePublicIdValue) {
      return {
        content: [{ type: 'text', text: 'Invalid note public ID.' }],
        isError: true,
      };
    }

    const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
    if (!workspaceIdValue) {
      return {
        content: [{ type: 'text', text: 'Workspace not found.' }],
        isError: true,
      };
    }

    const noteIdValue = await resolveNoteId(notePublicIdValue);
    if (!noteIdValue) {
      return {
        content: [{ type: 'text', text: 'Note not found.' }],
        isError: true,
      };
    }

    const rows = await db
      .select({
        id: notes.id,
        publicId: notes.publicId,
        name: notes.name,
        title: notes.title,
        content: notes.content,
        folderId: notes.folderId,
        folderPublicId: folders.publicId,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .leftJoin(folders, eq(notes.folderId, folders.id))
      .where(and(eq(notes.workspaceId, workspaceIdValue), eq(notes.id, noteIdValue)))
      .limit(1);

    const row = rows[0];

    if (!row) {
      return {
        content: [{ type: 'text', text: 'Note not found.' }],
        isError: true,
      };
    }

    const result = {
      publicId: row.publicId,
      name: row.name,
      title: row.title,
      content: row.content,
      folderPublicId: row.folderPublicId ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };

    return {
      content: [
        { type: 'text', text: `Loaded note ${notePublicId}.` },
        { type: 'text', text: result.content },
      ],
      structuredContent: { note: result },
    };
  });

  // Register createFolder tool
  server.registerTool('createFolder', {
    title: 'Create Folder',
    description: 'Create a new folder in the workspace. Optionally specify a parent folder to create a nested folder. Returns the public ID of the created folder.',
    inputSchema: {
      workspaceSlug: z.string().describe('The slug of the workspace'),
      name: z.string().min(1).describe('URL-safe folder name (kebab-case, camelCase, snake_case, or PascalCase)'),
      displayName: z.string().min(1).describe('Human-readable display name for the folder'),
      parentPublicId: z.string().optional().describe('Public ID of parent folder (omit for root level)')
    }
  }, async ({ workspaceSlug, name, displayName, parentPublicId }) => {
    try {
      const result = await createFolderInWorkspace({
        workspaceSlug,
        name,
        displayName,
        parentPublicId,
      });
      
      return {
        content: [
          { type: 'text', text: `Created folder: ${result.displayName}` },
          { type: 'text', text: JSON.stringify(result, null, 2) },
        ],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // Register createNote tool
  server.registerTool('createNote', {
    title: 'Create Note',
    description: 'Create a new note in the workspace. Optionally specify a folder to place the note in. Returns the public ID of the created note.',
    inputSchema: {
      workspaceSlug: z.string().describe('The slug of the workspace'),
      name: z.string().min(1).describe('URL-safe note name (kebab-case, camelCase, snake_case, or PascalCase)'),
      title: z.string().min(1).describe('Human-readable title for the note'),
      folderPublicId: z.string().optional().describe('Public ID of folder (omit for root level)'),
      content: z.string().optional().describe('Initial content for the note (defaults to empty string)')
    }
  }, async ({ workspaceSlug, name, title, folderPublicId, content }) => {
    try {
      const result = await createNoteInWorkspace({
        workspaceSlug,
        name,
        title,
        folderPublicId,
        content,
      });
      
      return {
        content: [
          { type: 'text', text: `Created note: ${result.title}` },
          { type: 'text', text: JSON.stringify(result, null, 2) },
        ],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // Register updateNoteContent tool
  server.registerTool('updateNoteContent', {
    title: 'Update Note Content',
    description: 'Update the content of an existing note. This creates a new revision and notifies connected clients. Returns the note public ID and revision ID.',
    inputSchema: {
      workspaceSlug: z.string().describe('The slug of the workspace'),
      notePublicId: z.string().describe('The public ID of the note to update'),
      content: z.string().describe('The new content for the note')
    }
  }, async ({ workspaceSlug, notePublicId, content }) => {
    try {
      const result = await updateNoteContentInWorkspace({
        workspaceSlug,
        notePublicId,
        content,
      });
      
      const response = {
        publicId: result.publicId,
        revisionId: result.revisionId,
        updatedAt: result.updatedAt.toISOString(),
      };
      
      return {
        content: [
          { type: 'text', text: `Updated note: ${notePublicId}` },
          { type: 'text', text: JSON.stringify(response, null, 2) },
        ],
        structuredContent: response,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
};

// Export the MCP handler wrapped with Better Auth's mcpHandler
const authBaseUrl = getAuthBaseUrl();

export const mcpRoute = mcpHandler(
  {
    jwksUrl: `${authBaseUrl}/api/auth/jwks`,
    verifyOptions: {
      issuer: `${authBaseUrl}/api/auth`,
      audience: [authBaseUrl, `${authBaseUrl}/`, `${authBaseUrl}/mcp`],
    },
    scopes: ["openid", "profile", "email"],
  },
  async (req: Request, jwt: any) => {
    // Create a fresh transport and server per request (stateless mode)
    const transport = new WebStandardStreamableHTTPServerTransport();
    const server = getServer();
    await server.connect(transport);
    return transport.handleRequest(req);
  }
);

export default mcpRoute;
