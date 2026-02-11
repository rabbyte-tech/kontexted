import { Hono } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
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
import { db } from "@/db";
import { notes, folders } from "@/db/schema";
import { and, eq, ilike, or, asc, sql } from "drizzle-orm";

const dialect = process.env.DATABASE_DIALECT === "sqlite" ? "sqlite" : "postgresql";

/**
 * Case-insensitive LIKE that works with both PostgreSQL and SQLite
 */
function caseInsensitiveLike(column: unknown, pattern: string) {
  if (dialect === "sqlite") {
    return sql`LOWER(${column}) LIKE LOWER(${pattern})`;
  }
  return ilike(column as any, pattern);
}

// Create JWKS function
let jwksFunction: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwksFunction() {
  if (!jwksFunction) {
    const authBaseUrl = getAuthBaseUrl();
    const jwksUrl = `${authBaseUrl}/api/auth/jwks`;
    jwksFunction = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwksFunction;
}

// Verify JWT Bearer token
async function verifyBearerToken(request: Request): Promise<Record<string, unknown> | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  const authBaseUrl = getAuthBaseUrl();
  const verifyOptions = {
    issuer: `${authBaseUrl}/api/auth`,
    audience: [authBaseUrl, `${authBaseUrl}/`, `${authBaseUrl}/mcp`],
  };

  try {
    const jwks = getJwksFunction();
    const { payload } = await jwtVerify(token, jwks, verifyOptions);
    return payload;
  } catch {
    return null;
  }
}

// Create Hono app
const skillApp = new Hono();

// POST /api/skill/workspace-tree
skillApp.post("/workspace-tree", async (c) => {
  // Verify JWT Bearer token
  const payload = await verifyBearerToken(c.req.raw);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Parse request body
  const body = await c.req.json();
  const { workspaceSlug } = body as { workspaceSlug?: unknown };

  if (!workspaceSlug || typeof workspaceSlug !== "string") {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  // Validate slug
  const slugValue = parseSlug(workspaceSlug);
  if (!slugValue) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  // Resolve workspace ID
  const workspaceId = await resolveWorkspaceId(slugValue);
  if (!workspaceId) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  // Get workspace tree
  const tree = await getWorkspaceTree(workspaceId);
  if (!tree) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  // Transform and return
  const transformedTree = transformWorkspaceTree(tree, slugValue);
  return c.json({ tree: transformedTree });
});

// POST /api/skill/search-notes
skillApp.post("/search-notes", async (c) => {
  // Verify JWT Bearer token
  const payload = await verifyBearerToken(c.req.raw);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Parse request body
  const body = await c.req.json();
  const { workspaceSlug, query, limit } = body as {
    workspaceSlug?: unknown;
    query?: unknown;
    limit?: unknown;
  };

  if (!workspaceSlug || typeof workspaceSlug !== "string") {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return c.json({ error: "Invalid query" }, 400);
  }

  // Validate slug
  const slugValue = parseSlug(workspaceSlug);
  if (!slugValue) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  // Resolve workspace ID
  const workspaceId = await resolveWorkspaceId(slugValue);
  if (!workspaceId) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  // Validate limit parameter
  let searchLimit = 20;
  if (limit !== undefined && limit !== null) {
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0) {
      return c.json({ error: "Invalid limit: must be a positive integer" }, 400);
    }
    if (limit > 50) {
      return c.json({ error: "Invalid limit: maximum is 50" }, 400);
    }
    searchLimit = limit;
  }

  // Perform search
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
        eq(notes.workspaceId, workspaceId),
        or(caseInsensitiveLike(notes.title, pattern), caseInsensitiveLike(notes.name, pattern))
      )
    )
    .orderBy(asc(notes.title))
    .limit(searchLimit);

  const matches = rows.map((row) => ({
    publicId: row.publicId,
    name: row.name,
    title: row.title,
    folderPublicId: row.folderPublicId ?? null,
  }));

  return c.json({ matches });
});

// POST /api/skill/note-by-id
skillApp.post("/note-by-id", async (c) => {
  // Verify JWT Bearer token
  const payload = await verifyBearerToken(c.req.raw);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Parse request body
  const body = await c.req.json();
  const { workspaceSlug, notePublicId } = body as {
    workspaceSlug?: unknown;
    notePublicId?: unknown;
  };

  if (!workspaceSlug || typeof workspaceSlug !== "string") {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  if (!notePublicId || typeof notePublicId !== "string") {
    return c.json({ error: "Invalid note public ID" }, 400);
  }

  // Validate slug
  const slugValue = parseSlug(workspaceSlug);
  if (!slugValue) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  // Resolve workspace ID
  const workspaceId = await resolveWorkspaceId(slugValue);
  if (!workspaceId) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  // Validate and parse note public ID
  const notePublicIdValue = parsePublicId(notePublicId);
  if (!notePublicIdValue) {
    return c.json({ error: "Invalid note public ID" }, 400);
  }

  // Resolve note ID
  const noteId = await resolveNoteId(notePublicIdValue);
  if (!noteId) {
    return c.json({ error: "Note not found" }, 404);
  }

  // Fetch note
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
    .where(and(eq(notes.workspaceId, workspaceId), eq(notes.id, noteId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "Note not found" }, 404);
  }

  const row = rows[0];
  const result = {
    publicId: row.publicId,
    name: row.name,
    title: row.title,
    content: row.content,
    folderPublicId: row.folderPublicId ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };

  return c.json({ note: result });
});

export { skillApp };
export default skillApp;
