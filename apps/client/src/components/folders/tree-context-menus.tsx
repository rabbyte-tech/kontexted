import type { JSX } from "react"
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { CloudUpload, FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react"

/**
 * Props for the NoteContextMenu component.
 */
interface NoteContextMenuProps {
  /** Handler for renaming the selected note. */
  onRenameNote: () => void
  /** Handler for deleting the selected note. */
  onDeleteNote: () => void
}

/**
 * Right-click context menu for notes.
 * Provides options to rename or delete a note.
 */
export function NoteContextMenu(props: NoteContextMenuProps): JSX.Element {
  const { onRenameNote, onDeleteNote } = props

  return (
    <ContextMenuContent>
      <ContextMenuItem onClick={onRenameNote}>
        <Pencil className="mr-2 h-4 w-4" />
        Rename note
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={onDeleteNote}>
        <Trash2 className="mr-2 h-4 w-4" />
        Delete note
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

/**
 * Props for the FolderContextMenu component.
 */
interface FolderContextMenuProps {
  /** Handler for creating a new subfolder. */
  onCreateFolder: () => void
  /** Handler for creating a new note in this folder. */
  onCreateNote: () => void
  /** Handler for renaming the selected folder. */
  onRenameFolder: () => void
  /** Handler for deleting the selected folder. */
  onDeleteFolder: () => void
  /** Handler for uploading markdown files to this folder. */
  onUpload: () => void
}

/**
 * Right-click context menu for folders.
 * Provides options to create nested items, rename, or delete the folder.
 */
export function FolderContextMenu(props: FolderContextMenuProps): JSX.Element {
  const { onCreateFolder, onCreateNote, onRenameFolder, onDeleteFolder, onUpload } =
    props

  return (
    <ContextMenuContent>
      <ContextMenuItem onClick={onCreateFolder}>
        <FolderPlus className="mr-2 h-4 w-4" />
        New folder
      </ContextMenuItem>
      <ContextMenuItem onClick={onCreateNote}>
        <FilePlus className="mr-2 h-4 w-4" />
        New note
      </ContextMenuItem>
      <ContextMenuItem onClick={onUpload}>
        <CloudUpload className="mr-2 h-4 w-4" />
        Upload markdown files
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onRenameFolder}>
        <Pencil className="mr-2 h-4 w-4" />
        Rename folder
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={onDeleteFolder}>
        <Trash2 className="mr-2 h-4 w-4" />
        Delete folder
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

/**
 * Props for the RootContextMenu component.
 */
interface RootContextMenuProps {
  /** Handler for creating a new folder at the root level. */
  onCreateFolder: () => void
  /** Handler for creating a new note at the root level. */
  onCreateNote: () => void
  /** Handler for uploading markdown files. */
  onUpload: () => void
}

/**
 * Right-click context menu for the root level.
 * Provides options to create folders, notes, or upload files at the root level.
 */
export function RootContextMenu(props: RootContextMenuProps): JSX.Element {
  const { onCreateFolder, onCreateNote, onUpload } = props

  return (
    <ContextMenuContent>
      <ContextMenuItem onClick={onCreateFolder}>
        <FolderPlus className="mr-2 h-4 w-4" />
        New folder
      </ContextMenuItem>
      <ContextMenuItem onClick={onCreateNote}>
        <FilePlus className="mr-2 h-4 w-4" />
        New note
      </ContextMenuItem>
      <ContextMenuItem onClick={onUpload}>
        <CloudUpload className="mr-2 h-4 w-4" />
        Upload markdown files
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
