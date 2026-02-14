import { useEffect, useMemo, useState } from "react"
import type { DragItem, TreeItem, DragLabelMap } from "./types"
import type { FolderNode, NoteSummary, WorkspaceTree } from "@/types"
import type { TreeLabelMode } from "@/stores/ui-store"

/**
 * Creates a drag ID string from type and publicId.
 * @param type - The type of the drag item ("folder" or "note")
 * @param publicId - The public ID of the item
 * @returns A formatted drag ID string in the format "type:publicId"
 */
export const makeDragId = (type: DragItem["type"], publicId: string): string =>
  `${type}:${publicId}`

/**
 * Parses a drag ID string back to a DragItem object.
 * @param value - The drag ID string or number to parse
 * @returns A DragItem object if valid, or null if parsing fails
 */
export const parseDragId = (value: string | number): DragItem | null => {
  const raw = String(value)
  const [type, publicId] = raw.split(":")
  if ((type !== "folder" && type !== "note") || !publicId) {
    return null
  }
  return { type, publicId } as DragItem
}

/**
 * Custom hook to check if a component is mounted.
 * Uses requestAnimationFrame to prevent hydration issues in React.
 * @returns A boolean indicating whether the component is mounted
 */
export const useMounted = (): boolean => {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
  }, [])
  return mounted
}

/**
 * Builds sorted tree items from folders and notes.
 * Combines folders and notes into a single array, sorted with folders first,
 * then alphabetically by label.
 * @param folders - Array of folder nodes to include
 * @param notes - Array of note summaries to include
 * @param labelMode - Whether to show "name" or "displayName"/"title"
 * @returns Sorted array of TreeItem objects
 */
export const buildTreeItems = (
  folders: FolderNode[],
  notes: NoteSummary[],
  labelMode: TreeLabelMode
): TreeItem[] => {
  const items: TreeItem[] = [
    ...folders.map((node) => ({
      type: "folder" as const,
      node,
      label: labelMode === "name" ? node.name : node.displayName,
    })),
    ...notes.map((note) => ({
      type: "note" as const,
      note,
      label: labelMode === "name" ? `${note.name}.md` : note.title,
    })),
  ]

  return items.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "folder" ? -1 : 1
    }
    return left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
  })
}

/**
 * Custom hook that builds label maps for drag operations.
 * Creates efficient lookup maps for folder and note display names and titles.
 * @param tree - The workspace tree containing folders and notes
 * @returns An object containing maps for folderDisplayNames, folderNames, noteTitles, and noteNames
 */
export const useDragLabels = (tree: WorkspaceTree): DragLabelMap => {
  return useMemo(() => {
    const folderDisplayNames = new Map<number, string>()
    const folderNames = new Map<number, string>()
    const noteTitles = new Map<number, string>()
    const noteNames = new Map<number, string>()

    const walk = (nodes: FolderNode[]) => {
      nodes.forEach((node) => {
        if (node.id !== undefined) {
          folderDisplayNames.set(node.id, node.displayName)
          folderNames.set(node.id, node.name)
        }
        node.notes.forEach((note) => {
          if (note.id !== undefined) {
            noteTitles.set(note.id, note.title)
            noteNames.set(note.id, note.name)
          }
        })
        walk(node.children)
      })
    }

    walk(tree.folders)
    tree.rootNotes.forEach((note) => {
      if (note.id !== undefined) {
        noteTitles.set(note.id, note.title)
        noteNames.set(note.id, note.name)
      }
    })

    return { folderDisplayNames, folderNames, noteTitles, noteNames }
  }, [tree])
}

/**
 * Recursively finds a folder node by its public ID.
 * @param publicId - The public ID to search for
 * @param nodes - Array of folder nodes to search through
 * @returns The matching FolderNode or null if not found
 */
export const findFolderByPublicId = (
  publicId: string,
  nodes: FolderNode[]
): FolderNode | null => {
  for (const node of nodes) {
    if (node.publicId === publicId) {
      return node
    }
    const found = findFolderByPublicId(publicId, node.children)
    if (found) {
      return found
    }
  }
  return null
}

/**
 * Collects all notes from a folder tree, traversing recursively.
 * @param nodes - Array of folder nodes to traverse
 * @returns Array of all NoteSummary objects found in the tree
 */
export const collectAllNotes = (nodes: FolderNode[]): NoteSummary[] => {
  const result: NoteSummary[] = []
  const traverse = (folders: FolderNode[]) => {
    folders.forEach((node) => {
      result.push(...node.notes)
      traverse(node.children)
    })
  }
  traverse(nodes)
  return result
}
