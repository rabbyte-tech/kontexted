import { eq } from "drizzle-orm";
import { db } from "@/db";
import { folders, notes, workspaces } from "@/db/schema";

export type NoteSummary = {
  id: number;
  publicId: string;
  name: string;
  title: string;
  folderId: number | null;
};

export type FolderNode = {
  id: number;
  publicId: string;
  name: string;
  displayName: string;
  parentId: number | null;
  notes: NoteSummary[];
  children: FolderNode[];
};

export type WorkspaceTree = {
  workspaceId: number;
  workspaceName: string;
  rootNotes: NoteSummary[];
  folders: FolderNode[];
};

const sortByDisplayName = (left: { displayName: string }, right: { displayName: string }) =>
  left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });

const sortByTitle = (left: { title: string }, right: { title: string }) =>
  left.title.localeCompare(right.title, undefined, { sensitivity: "base" });

const buildFolderTree = (folderRows: Array<Omit<FolderNode, "notes" | "children">>, noteRows: NoteSummary[]) => {
  const notesByFolder = new Map<number, NoteSummary[]>();
  const rootNotes: NoteSummary[] = [];

  noteRows.forEach((note) => {
    if (note.folderId) {
      const bucket = notesByFolder.get(note.folderId) ?? [];
      bucket.push(note);
      notesByFolder.set(note.folderId, bucket);
    } else {
      rootNotes.push(note);
    }
  });

  rootNotes.sort(sortByTitle);
  notesByFolder.forEach((entries) => entries.sort(sortByTitle));

  const nodeById = new Map<number, FolderNode>();
  folderRows.forEach((folder) => {
    nodeById.set(folder.id, {
      ...folder,
      notes: notesByFolder.get(folder.id) ?? [],
      children: [],
    });
  });

  const roots: FolderNode[] = [];
  nodeById.forEach((node) => {
    if (node.parentId && nodeById.has(node.parentId)) {
      nodeById.get(node.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortTree = (nodes: FolderNode[]) => {
    nodes.sort(sortByDisplayName);
    nodes.forEach((node) => {
      node.notes.sort(sortByTitle);
      sortTree(node.children);
    });
  };

  sortTree(roots);

  return { rootNotes, folders: roots };
};

export const getWorkspaceTree = async (workspaceId: number): Promise<WorkspaceTree | null> => {
  const workspaceRows = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (workspaceRows.length === 0) {
    return null;
  }

  const folderRows = await db
    .select({
      id: folders.id,
      publicId: folders.publicId,
      name: folders.name,
      displayName: folders.displayName,
      parentId: folders.parentId,
    })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceId));

  const noteRows = await db
    .select({ id: notes.id, publicId: notes.publicId, name: notes.name, title: notes.title, folderId: notes.folderId })
    .from(notes)
    .where(eq(notes.workspaceId, workspaceId));

  const tree = buildFolderTree(folderRows, noteRows);

  return {
    workspaceId,
    workspaceName: workspaceRows[0].name,
    rootNotes: tree.rootNotes,
    folders: tree.folders,
  };
};
