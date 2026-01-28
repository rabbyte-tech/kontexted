import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { folders, notes } from "@kontexted/db";
import { isValidFolderName } from "@/lib/folder-name";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveFolderId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";

export const runtime = "nodejs";

type UploadEntry = {
  name: string;
  title: string;
  content: string;
  folderPath: string | null;
};

type UploadRequest = {
  entries: UploadEntry[];
  targetFolderPublicId: string | null;
};

type UploadResponse = {
  created: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
};

type ParsedEntry = UploadEntry & { index: number };

const generateUniqueName = async (baseName: string, folderId: number | null, workspaceId: number): Promise<string> => {
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

  return createFolderRecursively(remainingParts, folderId, workspaceId);
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId: workspaceSlug } = await params;
  const workspaceSlugValue = parseSlug(workspaceSlug);

  if (!workspaceSlugValue) {
    return NextResponse.json({ error: "Invalid workspace slug" }, { status: 400 });
  }

  const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
  if (!workspaceIdValue) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { entries, targetFolderPublicId }: UploadRequest = body as UploadRequest;

  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "Entries array is required" }, { status: 400 });
  }

  let resolvedTargetFolderId: number | null = null;
  if (targetFolderPublicId) {
    const targetFolderIdValue = parsePublicId(targetFolderPublicId);
    if (!targetFolderIdValue) {
      return NextResponse.json({ error: "Invalid target folder id" }, { status: 400 });
    }
    resolvedTargetFolderId = await resolveFolderId(targetFolderIdValue);
    if (!resolvedTargetFolderId) {
      return NextResponse.json({ error: "Target folder not found" }, { status: 404 });
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

      const uniqueName = await generateUniqueName(entry.name, finalFolderId, workspaceIdValue);

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

  return NextResponse.json(response, { status: 200 });
}
