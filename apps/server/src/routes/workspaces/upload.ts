import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { folders, notes } from "@/db/schema";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveFolderId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";
import { isValidFolderName } from "@/lib/folder-name";
import { requireAuth } from "@/routes/middleware/require-auth";
import type { Variables, DbClient, UploadEntry, UploadResponse } from "@/routes/types";
import { isRecord } from "@/routes/types";

const app = new Hono<{ Variables: Variables }>();

type ParsedEntry = UploadEntry & { index: number };

const generateUniqueName = async (
  db: DbClient,
  baseName: string,
  folderId: number | null,
  workspaceId: number
): Promise<string> => {
  const existingNotes = await db
    .select({ name: notes.name })
    .from(notes)
    .where(
      folderId === null
        ? and(eq(notes.workspaceId, workspaceId), isNull(notes.folderId))
        : and(eq(notes.workspaceId, workspaceId), eq(notes.folderId, folderId!))
    );

  const existingNames = new Set(existingNotes.map((n) => n.name));

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let suffix = 2;
  let newName: string;
  do {
    newName = `${baseName}-${suffix}`;
    suffix++;
  } while (existingNames.has(newName));

  return newName;
};

const createFolderRecursively = async (
  db: DbClient,
  pathParts: string[],
  parentFolderId: number | null,
  workspaceId: number
): Promise<number | null> => {
  if (pathParts.length === 0) {
    return parentFolderId;
  }

  const [currentPart, ...remainingParts] = pathParts;

  const conditions = [
    eq(folders.workspaceId, workspaceId),
    eq(folders.name, currentPart),
  ];
  if (parentFolderId === null) {
    conditions.push(isNull(folders.parentId));
  } else {
    conditions.push(eq(folders.parentId, parentFolderId));
  }

  const existingFolder = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(...conditions))
    .limit(1);

  let folderId: number;

  if (existingFolder.length > 0) {
    folderId = existingFolder[0].id;
  } else {
    const inserted = await db
      .insert(folders)
      .values({
        workspaceId,
        parentId: parentFolderId,
        name: currentPart,
        displayName: currentPart,
      })
      .returning({ id: folders.id, publicId: folders.publicId });

    folderId = inserted[0].id;

    workspaceEventHub.publish({
      workspaceId,
      type: "folder.created",
      data: inserted[0],
    });
  }

  return createFolderRecursively(db, remainingParts, folderId, workspaceId);
};

app.post("/", requireAuth, async (c) => {
  const db = c.get("db");
  const workspaceSlug = c.req.param("workspaceSlug");
  const validatedSlug = parseSlug(workspaceSlug);

  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body)) {
    return c.json({ error: "Invalid payload" }, 400);
  }

  const entries = body.entries;
  const targetFolderPublicId = body.targetFolderPublicId == null ? null : body.targetFolderPublicId;

  if (!Array.isArray(entries) || entries.length === 0) {
    return c.json({ error: "Entries array is required" }, 400);
  }

  let resolvedTargetFolderId: number | null = null;
  if (targetFolderPublicId) {
    const targetFolderIdValue = typeof targetFolderPublicId === "string" ? parsePublicId(targetFolderPublicId) : null;
    if (!targetFolderIdValue) {
      return c.json({ error: "Invalid target folder id" }, 400);
    }
    resolvedTargetFolderId = await resolveFolderId(targetFolderIdValue);
    if (!resolvedTargetFolderId) {
      return c.json({ error: "Target folder not found" }, 404);
    }
  }

  const response: UploadResponse = {
    created: 0,
    skipped: 0,
    errors: [],
  };

  // First, collect all unique folder paths and ensure they exist
  const folderPaths = new Set<string>();
  const entriesWithPath: ParsedEntry[] = entries.map((entry, index) => ({ ...entry, index }));

  for (const entry of entriesWithPath) {
    if (entry.folderPath) {
      folderPaths.add(entry.folderPath);
    }
  }

  // Create all folders first
  const folderIdCache = new Map<string, number>();

  for (const folderPath of Array.from(folderPaths).sort()) {
    const pathParts = folderPath.split('/').filter(Boolean);
    try {
      const folderId = await createFolderRecursively(
        db,
        pathParts,
        resolvedTargetFolderId,
        workspaceIdValue
      );
      if (folderId) {
        folderIdCache.set(folderPath, folderId);
      }
    } catch (error) {
      response.errors.push({
        path: folderPath,
        error: error instanceof Error ? error.message : "Failed to create folder",
      });
    }
  }

  // Then process all entries
  for (const entry of entriesWithPath) {
    try {
      if (!entry.name) {
        response.errors.push({ path: entry.folderPath || "root", error: "Invalid name" });
        continue;
      }

      if (!entry.title) {
        response.errors.push({ path: entry.folderPath || "root", error: "Invalid title" });
        continue;
      }

      if (!isValidFolderName(entry.name)) {
        response.errors.push({
          path: entry.folderPath || "root",
          error: `Name "${entry.name}" must be kebab-case, camelCase, snake_case, or PascalCase`,
        });
        continue;
      }

      let finalFolderId = resolvedTargetFolderId;

      if (entry.folderPath && folderIdCache.has(entry.folderPath)) {
        finalFolderId = folderIdCache.get(entry.folderPath)!;
      } else if (entry.folderPath) {
        response.errors.push({
          path: entry.folderPath,
          error: "Folder was not created",
        });
        continue;
      }

      const uniqueName = await generateUniqueName(db, entry.name, finalFolderId, workspaceIdValue);

      const inserted = await db
        .insert(notes)
        .values({
          workspaceId: workspaceIdValue,
          folderId: finalFolderId,
          name: uniqueName,
          title: entry.title,
          content: entry.content,
        })
        .returning({ id: notes.id, publicId: notes.publicId, name: notes.name, title: notes.title, folderId: notes.folderId });

      workspaceEventHub.publish({
        workspaceId: workspaceIdValue,
        type: "note.created",
        data: inserted[0],
      });

      response.created++;
    } catch (error) {
      response.errors.push({
        path: entry.folderPath || "root",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return c.json(response, 200);
});

export { app };
