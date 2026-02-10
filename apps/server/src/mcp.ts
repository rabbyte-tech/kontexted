import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { withMcpAuth } from "better-auth/plugins";
import { auth } from "@/auth";
import { z } from "zod";
import { db } from "@/db";
import { notes, folders, workspaces } from "@/db/schema";
import { and, eq, ilike, or, asc } from "drizzle-orm";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveNoteId, resolveFolderId } from "@/lib/resolvers";
import { getWorkspaceTree, type FolderNode, type WorkspaceTree } from "@/lib/workspace-tree";

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

type FolderNodeWithPublicId = {
  publicId: string;
  name: string;
  displayName: string;
  parentPublicId: string | null;
  notes: z.infer<typeof noteSummarySchema>[];
  children: FolderNodeWithPublicId[];
};

type WorkspaceTreeWithPublicId = {
  workspaceSlug: string;
  workspaceName: string;
  rootNotes: z.infer<typeof noteSummarySchema>[];
  folders: FolderNodeWithPublicId[];
};

const transformFolderTree = (
  folders: FolderNode[],
  folderPublicIdMap: Map<number, string>
): FolderNodeWithPublicId[] => {
  return folders.map((folder) => ({
    publicId: folder.publicId,
    name: folder.name,
    displayName: folder.displayName,
    parentPublicId: folder.parentId ? folderPublicIdMap.get(folder.parentId) ?? null : null,
    notes: folder.notes.map((note) => ({
      publicId: note.publicId,
      name: note.name,
      title: note.title,
      folderPublicId: note.folderId ? folderPublicIdMap.get(note.folderId) ?? null : null,
    })),
    children: transformFolderTree(folder.children, folderPublicIdMap),
  }));
};

const transformWorkspaceTree = (
  tree: WorkspaceTree,
  workspaceSlug: string
): WorkspaceTreeWithPublicId => {
  const folderPublicIdMap = new Map<number, string>();
  tree.folders.forEach((folder) => {
    folderPublicIdMap.set(folder.id, folder.publicId);
  });

  return {
    workspaceSlug,
    workspaceName: tree.workspaceName,
    rootNotes: tree.rootNotes.map((note) => ({
      publicId: note.publicId,
      name: note.name,
      title: note.title,
      folderPublicId: note.folderId ? folderPublicIdMap.get(note.folderId) ?? null : null,
    })),
    folders: transformFolderTree(tree.folders, folderPublicIdMap),
  };
};

// Build MCP server with tools
const buildMcpServer = () => {
  const server = new McpServer({
    name: "kontexted",
    version: "0.1.0",
  });

  // Register getWorkspaceTree tool
  server.registerTool(
    "getWorkspaceTree",
    {
      title: "Get workspace tree",
      description: "Fetch the folder tree of folders and notes for the configured workspace",
      inputSchema: z.object({
        workspaceSlug: z.string(),
      }),
      outputSchema: z.object({
        tree: workspaceTreeSchema,
      }),
    },
    async ({ workspaceSlug }: { workspaceSlug: string }) => {
      const workspaceSlugValue = parseSlug(workspaceSlug);
      if (!workspaceSlugValue) {
        return {
          content: [{ type: "text", text: "Invalid workspace slug." }],
          isError: true,
        };
      }

      const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
      if (!workspaceIdValue) {
        return {
          content: [{ type: "text", text: "Workspace not found." }],
          isError: true,
        };
      }

      const tree = await getWorkspaceTree(workspaceIdValue);

      if (!tree) {
        return {
          content: [{ type: "text", text: "Workspace not found." }],
          isError: true,
        };
      }

      const transformedTree = transformWorkspaceTree(tree, workspaceSlugValue);

      return {
        content: [
          { type: "text", text: `Loaded tree for workspace ${workspaceSlug}.` },
          { type: "text", text: JSON.stringify({ tree: transformedTree }, null, 2) },
        ],
        structuredContent: { tree: transformedTree },
      };
    }
  );

  // Register searchNotesByQuery tool
  server.registerTool(
    "searchNotesByQuery",
    {
      title: "Search notes by query",
      description: "Find notes by name or title in the configured workspace",
      inputSchema: z.object({
        workspaceSlug: z.string(),
        query: z.string().min(1),
        limit: z.number().int().positive().max(50).optional(),
      }),
      outputSchema: searchNotesSchema,
    },
    async ({ workspaceSlug, query, limit }: { workspaceSlug: string; query: string; limit?: number }) => {
      const workspaceSlugValue = parseSlug(workspaceSlug);
      if (!workspaceSlugValue) {
        return {
          content: [{ type: "text", text: "Invalid workspace slug." }],
          isError: true,
        };
      }

      const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
      if (!workspaceIdValue) {
        return {
          content: [{ type: "text", text: "Workspace not found." }],
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
            or(ilike(notes.title, pattern), ilike(notes.name, pattern))
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
          { type: "text", text: `Found ${matches.length} matching notes.` },
          { type: "text", text: JSON.stringify({ matches }, null, 2) },
        ],
        structuredContent: { matches },
      };
    }
  );

  // Register getNoteById tool
  server.registerTool(
    "getNoteById",
    {
      title: "Get note by id",
      description: "Fetch a note by public ID from the configured workspace",
      inputSchema: z.object({
        workspaceSlug: z.string(),
        notePublicId: z.string(),
      }),
      outputSchema: z.object({
        note: noteSchema,
      }),
    },
    async ({ workspaceSlug, notePublicId }: { workspaceSlug: string; notePublicId: string }) => {
      const workspaceSlugValue = parseSlug(workspaceSlug);
      if (!workspaceSlugValue) {
        return {
          content: [{ type: "text", text: "Invalid workspace slug." }],
          isError: true,
        };
      }

      const notePublicIdValue = parsePublicId(notePublicId);
      if (!notePublicIdValue) {
        return {
          content: [{ type: "text", text: "Invalid note public ID." }],
          isError: true,
        };
      }

      const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
      if (!workspaceIdValue) {
        return {
          content: [{ type: "text", text: "Workspace not found." }],
          isError: true,
        };
      }

      const noteIdValue = await resolveNoteId(notePublicIdValue);
      if (!noteIdValue) {
        return {
          content: [{ type: "text", text: "Note not found." }],
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
          content: [{ type: "text", text: "Note not found." }],
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
          { type: "text", text: `Loaded note ${notePublicId}.` },
          { type: "text", text: result.content },
        ],
        structuredContent: { note: result },
      };
    }
  );

  return server;
};

// Create the MCP request handler
export const createMcpHandler = () => {
  return withMcpAuth(auth as any, async (request: any, session: any) => {
    const server = buildMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);

    return transport.handleRequest(request, {
      authInfo: {
        token: session.accessToken,
        clientId: session.clientId,
        scopes: session.scopes ? session.scopes.split(' ') : [],
        expiresAt: session.accessTokenExpiresAt ? Math.floor(session.accessTokenExpiresAt.getTime() / 1000) : undefined,
        extra: {
          userId: session.userId,
        },
      },
    });
  });
};

export default createMcpHandler;
