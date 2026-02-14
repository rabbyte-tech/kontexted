import type { FolderNode, WorkspaceTree } from "@/lib/workspace-tree";

/**
 * Summary of a note for external/public API responses.
 * Contains only publicly shareable information with publicId instead of internal id.
 */
export type NoteSummary = {
  publicId: string;
  name: string;
  title: string;
  folderPublicId: string | null;
};

/**
 * A folder node with public IDs for external/public API responses.
 * Recursive structure representing a folder and its children.
 */
export type FolderNodeWithPublicId = {
  publicId: string;
  name: string;
  displayName: string;
  parentPublicId: string | null;
  notes: NoteSummary[];
  children: FolderNodeWithPublicId[];
};

/**
 * Workspace tree structure with public IDs for external/public API responses.
 */
export type WorkspaceTreeWithPublicId = {
  workspaceSlug: string;
  workspaceName: string;
  rootNotes: NoteSummary[];
  folders: FolderNodeWithPublicId[];
};

/**
 * Transform a folder tree from internal structure to public API structure.
 * Replaces internal IDs with public IDs for external consumption.
 *
 * @param folders - Array of internal folder nodes
 * @param folderPublicIdMap - Map of internal folder IDs to their public IDs
 * @returns Array of folder nodes with public IDs
 */
export const transformFolderTree = (
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

/**
 * Recursively collects all folder IDs from a folder tree.
 * @param folders - Array of folder nodes to traverse
 * @returns Map of internal folder IDs to their public IDs
 */
const collectAllFolderIds = (folders: FolderNode[]): Map<number, string> => {
  const map = new Map<number, string>();
  const traverse = (nodes: FolderNode[]) => {
    nodes.forEach((node) => {
      map.set(node.id, node.publicId);
      if (node.children.length > 0) {
        traverse(node.children);
      }
    });
  };
  traverse(folders);
  return map;
};

/**
 * Transform a workspace tree from internal structure to public API structure.
 * Replaces internal IDs with public IDs for external consumption.
 *
 * @param tree - Internal workspace tree structure
 * @param workspaceSlug - The workspace slug for the response
 * @returns Workspace tree with public IDs suitable for external APIs
 */
export const transformWorkspaceTree = (
  tree: WorkspaceTree,
  workspaceSlug: string
): WorkspaceTreeWithPublicId => {
  const folderPublicIdMap = collectAllFolderIds(tree.folders);

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
