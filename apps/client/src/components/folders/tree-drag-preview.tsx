/**
 * DragPreview component for the folder tree.
 * Displays a visual preview of the item being dragged during drag operations.
 */

import { Folder as FolderIcon, FileText } from "lucide-react"
import type { JSX } from "react"
import type { DragItem } from "@/features/folders/types"

interface DragPreviewProps {
  item: DragItem | null
  label: string | null
}

/**
 * Renders a drag preview overlay showing the item being dragged.
 * Returns null when no item is being dragged.
 */
export function DragPreview({ item, label }: DragPreviewProps): JSX.Element | null {
  if (!item) {
    return null
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-xl">
      {item.type === "folder" ? (
        <FolderIcon className="h-4 w-4 text-muted-foreground" />
      ) : (
        <FileText className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="max-w-[220px] truncate">
        {label ?? (item.type === "folder" ? "Moving folder" : "Moving note")}
      </span>
    </div>
  )
}
