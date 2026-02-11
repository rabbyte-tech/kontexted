import { CSS } from "@dnd-kit/utilities"
import type { JSX } from "react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { FileText, FolderIcon, GripVertical, ChevronDown, ChevronRight } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"
import { NoteContextMenu, FolderContextMenu, RootContextMenu } from "@/components/folders/tree-context-menus"
import { rootDropId } from "@/features/folders/types"
import { makeDragId } from "@/features/folders/utils"
import { buildTreeItems } from "@/features/folders/utils"
import { cn } from "@/lib/utils"
import type { TreeLabelMode } from "@/stores/ui-store"
import type { FolderNode, NoteSummary } from "@/types"

interface NoteRowProps {
  workspaceSlug: string
  note: NoteSummary
  label: string
  selectedNotePublicId: string | null
  dragEnabled: boolean
  onRenameNote: () => void
  onDeleteNote: () => void
  level?: number
}

interface FolderRowProps {
  node: FolderNode
  level: number
  expandedIds: Set<string>
  toggleFolder: (id: string) => void
  workspaceSlug: string
  selectedFolderPublicId: string | null
  selectedNotePublicId: string | null
  onSelectFolder: (id: number) => void
  dragEnabled: boolean
  labelMode: TreeLabelMode
  onCreateFolder: (folderPublicId: string) => void
  onCreateNote: (folderPublicId: string) => void
  onRenameFolder: (folderPublicId: string) => void
  onDeleteFolder: (folderPublicId: string) => void
  onUpload: (folderPublicId: string) => void
  onRenameNote: (notePublicId: string) => void
  onDeleteNote: (notePublicId: string) => void
}

interface RootDropRowProps {
  onCreateFolder: () => void
  onCreateNote: () => void
  onUpload: () => void
}

/**
 * Renders a single note item in the folder tree.
 * Displays the note with drag functionality and context menu.
 */
export function NoteRow({
  workspaceSlug,
  note,
  label,
  selectedNotePublicId,
  dragEnabled,
  onRenameNote,
  onDeleteNote,
  level = 0,
}: NoteRowProps): JSX.Element {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: makeDragId("note", note.publicId),
  })
  const dragProps = dragEnabled ? { ...listeners, ...attributes } : {}
  const rowStyle = isDragging
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={{
            ...rowStyle,
            paddingLeft: level === 0 ? 4 : level * 12,
          }}
          className={cn(
            "group flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition",
            "hover:bg-accent",
            selectedNotePublicId === note.publicId && "bg-accent text-foreground",
            isDragging && "opacity-50"
          )}
        >
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...dragProps}
            className="opacity-0 transition group-hover:opacity-100 touch-none"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="shrink-0 w-4" />
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <Link
              to="/workspaces/$workspaceSlug/notes/$noteId"
              params={{ workspaceSlug, noteId: note.publicId }}
              search={(prev: Record<string, unknown>) => ({ labels: typeof prev.labels === "string" ? prev.labels : undefined, view: (prev.view === "code" || prev.view === "split" || prev.view === "preview") ? prev.view : undefined })}
              className="flex-1 truncate"
            >
              {label}
            </Link>
          </div>
        </div>
      </ContextMenuTrigger>
      <NoteContextMenu
        onRenameNote={onRenameNote}
        onDeleteNote={onDeleteNote}
      />
    </ContextMenu>
  )
}

/**
 * Renders the root folder drop zone at the top of the tree.
 * Provides options to create folders, notes, and upload files at the root level.
 */
export function RootDropRow({
  onCreateFolder,
  onCreateNote,
  onUpload,
}: RootDropRowProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: rootDropId })

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={{ paddingLeft: 4 }}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition",
            "hover:bg-accent",
            isOver && "bg-accent/70"
          )}
        >
          <FolderIcon className="h-4 w-4" />
          <span className="font-medium text-foreground">Root</span>
        </div>
      </ContextMenuTrigger>
      <RootContextMenu
        onCreateFolder={onCreateFolder}
        onCreateNote={onCreateNote}
        onUpload={onUpload}
      />
    </ContextMenu>
  )
}

/**
 * Renders a folder and its children recursively in the folder tree.
 * Handles folder expansion/collapse, drag-and-drop, and context menu operations.
 */
export function FolderRow({
  node,
  level,
  expandedIds,
  toggleFolder,
  workspaceSlug,
  selectedFolderPublicId,
  selectedNotePublicId,
  onSelectFolder,
  dragEnabled,
  labelMode,
  onCreateFolder,
  onCreateNote,
  onRenameFolder,
  onDeleteFolder,
  onUpload,
  onRenameNote,
  onDeleteNote,
}: FolderRowProps): JSX.Element {
  const isExpanded = expandedIds.has(node.publicId)
  const label = labelMode === "name" ? node.name : node.displayName
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: makeDragId("folder", node.publicId),
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: makeDragId("folder", node.publicId),
    disabled: isDragging,
  })
  const dragProps = dragEnabled ? { ...listeners, ...attributes } : {}
  const rowStyle = isDragging
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  return (
    <div ref={setDropRef} className="space-y-1">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setNodeRef}
            style={{
              ...rowStyle,
              paddingLeft: level === 0 ? 4 : level * 12,
            }}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-1 text-sm transition",
              "hover:bg-accent",
              isOver && "bg-accent/70",
              selectedFolderPublicId === node.publicId && "bg-accent text-foreground",
              isDragging && "opacity-50"
            )}
          >
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...dragProps}
              className="opacity-0 transition group-hover:opacity-100 touch-none"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => toggleFolder(node.publicId)}
                className="text-muted-foreground shrink-0"
                aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <FolderIcon className="h-4 w-4 shrink-0" />
              <button
                type="button"
                onClick={() => node.id !== undefined && onSelectFolder(node.id)}
                className="flex-1 truncate text-left"
              >
                {label}
              </button>
            </div>
          </div>
        </ContextMenuTrigger>
        <FolderContextMenu
          onCreateFolder={() => onCreateFolder(node.publicId)}
          onCreateNote={() => onCreateNote(node.publicId)}
          onRenameFolder={() => onRenameFolder(node.publicId)}
          onDeleteFolder={() => onDeleteFolder(node.publicId)}
          onUpload={() => onUpload(node.publicId)}
        />
      </ContextMenu>
      {isExpanded ? (
        <div className="space-y-1">
          {buildTreeItems(node.children, node.notes, labelMode).map((item) => {
            if (item.type === "folder") {
              return (
                <FolderRow
                  key={`folder-${item.node.publicId}`}
                  node={item.node}
                  level={level + 1}
                  expandedIds={expandedIds}
                  toggleFolder={toggleFolder}
                  workspaceSlug={workspaceSlug}
                  selectedFolderPublicId={selectedFolderPublicId}
                  selectedNotePublicId={selectedNotePublicId}
                  onSelectFolder={onSelectFolder}
                  dragEnabled={dragEnabled}
                  labelMode={labelMode}
                  onCreateFolder={onCreateFolder}
                  onCreateNote={onCreateNote}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onUpload={onUpload}
                  onRenameNote={onRenameNote}
                  onDeleteNote={onDeleteNote}
                />
              )
            }

            return (
              <NoteRow
                key={`note-${item.note.publicId}`}
                workspaceSlug={workspaceSlug}
                note={item.note}
                label={item.label}
                selectedNotePublicId={selectedNotePublicId}
                dragEnabled={dragEnabled}
                onRenameNote={() => onRenameNote(item.note.publicId)}
                onDeleteNote={() => onDeleteNote(item.note.publicId)}
                level={level + 1}
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
