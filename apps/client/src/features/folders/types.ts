/**
 * Type definitions for the folders feature.
 * Extracted from folder-tree.tsx as part of Phase 1 refactoring.
 */

import type { FolderNode, NoteSummary, WorkspaceTree } from "@/types"

/**
 * Represents an item being dragged in the folder tree.
 * Used for drag-and-drop operations with dnd-kit.
 */
export type DragItem = {
  type: "folder" | "note"
  publicId: string
}

/**
 * Union type representing a single item in the folder tree.
 * Can be either a folder node or a note summary, both with a display label.
 */
export type TreeItem =
  | { type: "folder"; node: FolderNode; label: string }
  | { type: "note"; note: NoteSummary; label: string }

/**
 * Maps for looking up display labels during drag operations.
 * Used by the useDragLabels hook to efficiently retrieve labels by item ID.
 */
export type DragLabelMap = {
  folderDisplayNames: Map<number, string>
  folderNames: Map<number, string>
  noteTitles: Map<number, string>
  noteNames: Map<number, string>
}

/**
 * Dialog UI copy/labels for folder and note operations.
 * Provides consistent text for create, rename, and delete dialogs.
 */
export type DialogCopy = {
  title: string
  displayNameLabel: string
  displayNamePlaceholder: string
  nameLabel: string
  namePlaceholder: string
  submitLabel: string
}

/**
 * Minimal workspace information for the workspace switcher.
 * Contains essential details needed for workspace navigation.
 */
export type WorkspaceSummary = {
  id: number
  slug: string
  name: string
}

/**
 * Main component props for the FolderTree component.
 * Handles workspace context and initial tree data.
 */
export type FolderTreeProps = {
  workspaceSlug: string | null
  workspaceName: string
  workspaces: WorkspaceSummary[]
  initialTree: WorkspaceTree | null
}

/**
 * Special drop target ID for the root folder.
 * Used when dropping items at the workspace root level.
 */
export const rootDropId = "root-folder"
