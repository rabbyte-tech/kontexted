import { Link, useNavigate, useLocation } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import {
  useCreateWorkspace,
} from "@/features/workspaces/mutations"
import {
  useCreateFolder,
  useCreateNote,
  useUpdateFolder,
  useUpdateNote,
  useDeleteFolder,
  useDeleteNote,
  useMoveFolder,
  useMoveNote,
} from "@/features/notes/mutations"
import { useUIStore, uiSelectors, type DialogState, type TreeLabelMode } from "@/stores/ui-store"
import { authQueryKeys, noteQueryKeys, workspaceQueryKeys } from "@/lib/query/query-keys"
import { queryClient } from "@/lib/query/query-client"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CloudUpload,
  FilePlus,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { FolderNode, NoteSummary, WorkspaceTree } from "@/types"
import { apiClient } from "@/lib/api-client"
import { sessionQueryOptions } from "@/features/auth/queries"
import MarkdownUpload from "./markdown-upload"

const rootDropId = "root-folder"

type WorkspaceSummary = {
  id: number
  slug: string
  name: string
}

type FolderTreeProps = {
  workspaceSlug: string | null
  workspaceName: string
  workspaces: WorkspaceSummary[]
  initialTree: WorkspaceTree | null
}

type DragItem = {
  type: "folder" | "note"
  publicId: string
}

const makeDragId = (type: DragItem["type"], publicId: string) => `${type}:${publicId}`

const parseDragId = (value: string | number): DragItem | null => {
  const raw = String(value)
  const [type, publicId] = raw.split(":")
  if ((type !== "folder" && type !== "note") || !publicId) {
    return null
  }
  return { type, publicId } as DragItem
}

const useMounted = () => {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
  }, [])
  return mounted
}

// TODO: Remove or use - kept for potential future tree traversal needs
const _collectFolderPublicIds = (nodes: FolderNode[], acc: string[] = []) => {
  nodes.forEach((node) => {
    acc.push(node.publicId)
    _collectFolderPublicIds(node.children, acc)
  })
  return acc
}

type TreeItem =
  | { type: "folder"; node: FolderNode; label: string }
  | { type: "note"; note: NoteSummary; label: string }

type DragLabelMap = {
  folderDisplayNames: Map<number, string>
  folderNames: Map<number, string>
  noteTitles: Map<number, string>
  noteNames: Map<number, string>
}

const buildTreeItems = (
  folders: FolderNode[],
  notes: NoteSummary[],
  labelMode: TreeLabelMode
) => {
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

const useDragLabels = (tree: WorkspaceTree): DragLabelMap => {
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

const NoteRow = ({
  workspaceSlug,
  note,
  label,
  selectedNotePublicId,
  dragEnabled,
  onRenameNote,
  onDeleteNote,
  level = 0,
}: {
  workspaceSlug: string
  note: NoteSummary
  label: string
  selectedNotePublicId: string | null
  dragEnabled: boolean
  onRenameNote: () => void
  onDeleteNote: () => void
  level?: number
}) => {
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

const RootDropRow = ({
  onCreateFolder,
  onCreateNote,
  onUpload,
}: {
  onCreateFolder: () => void
  onCreateNote: () => void
  onUpload: () => void
}) => {
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

const RootContextMenu = ({
  onCreateFolder,
  onCreateNote,
  onUpload,
}: {
  onCreateFolder: () => void
  onCreateNote: () => void
  onUpload: () => void
}) => {
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

const FolderContextMenu = ({
  onCreateFolder,
  onCreateNote,
  onRenameFolder,
  onDeleteFolder,
  onUpload,
}: {
  onCreateFolder: () => void
  onCreateNote: () => void
  onRenameFolder: () => void
  onDeleteFolder: () => void
  onUpload: () => void
}) => {
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

const NoteContextMenu = ({
  onRenameNote,
  onDeleteNote,
}: {
  onRenameNote: () => void
  onDeleteNote: () => void
}) => {
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

const FolderRow = ({
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
}: {
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
}) => {
  const isExpanded = expandedIds.has(node.publicId)
  const label = labelMode === "name" ? node.name : node.displayName
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: makeDragId("folder", node.publicId),
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: makeDragId("folder", node.publicId),
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
              paddingLeft: level === 0 ?4 : level * 12,
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

const DragPreview = ({
  item,
  label,
}: {
  item: DragItem | null
  label: string | null
}) => {
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

export default function FolderTree({
  workspaceSlug,
  workspaceName,
  workspaces,
  initialTree,
}: FolderTreeProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: session } = useQuery(sessionQueryOptions)

  // Zustand UI store for cross-route persistent UI state
  const labelMode = useUIStore((s) => s.labelMode)
  const expandedIds = useUIStore((s) => uiSelectors.getExpandedFolders(workspaceSlug ?? "")(s))
  const createWorkspaceModalOpen = useUIStore((s) => s.createWorkspaceModalOpen)
  const activeDialog = useUIStore((s) => s.activeDialog)
  const dialogDraft = useUIStore((s) => s.dialogDraft)
  
  const {
    setLabelMode,
    toggleExpandedFolder,
    openCreateWorkspaceModal,
    closeCreateWorkspaceModal,
    openDialog,
    closeDialog,
    setDialogDraft,
    clearDialogDraft,
    resetExpandedFolders,
  } = useUIStore()

  // Mutation hooks
  const createWorkspaceMutation = useCreateWorkspace()
  const createFolderMutation = useCreateFolder()
  const createNoteMutation = useCreateNote()
  const updateFolderMutation = useUpdateFolder()
  const updateNoteMutation = useUpdateNote()
  const deleteFolderMutation = useDeleteFolder()
  const deleteNoteMutation = useDeleteNote()
  const moveFolderMutation = useMoveFolder()
  const moveNoteMutation = useMoveNote()

  const selectedNotePublicId = useMemo(() => {
    const pathParts = location.pathname.split("/")
    const notesIndex = pathParts.indexOf("notes")
    // Check if this is a /workspaces/:workspaceSlug/notes/:noteId or /workspaces/:workspaceSlug/notes/:noteId/history route
    if (notesIndex !== -1 && pathParts.length > notesIndex + 1) {
      const noteId = pathParts[notesIndex + 1]
      // Return noteId if next segment is "history" or if there's no more segments
      if (pathParts[notesIndex + 2] === "history" || pathParts.length === notesIndex + 2) {
        return noteId
      }
    }
    return null
  }, [location.pathname])
  const { isMobile } = useSidebar()

  const isMounted = useMounted()
  const dragEnabled = isMounted
  const hasWorkspace = workspaceSlug != null
  const fallbackTree = useMemo<WorkspaceTree>(
    () => ({
      workspaceId: undefined,
      workspaceName,
      rootNotes: [],
      folders: [],
      workspaceSlug: workspaceSlug || "",
    }),
    [workspaceName, workspaceSlug]
  )
  const [tree, setTree] = useState(initialTree ?? fallbackTree)
  const [selectedFolderPublicId, setSelectedFolderPublicId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [activeDrag, setActiveDrag] = useState<DragItem | null>(null)
  const [workspaceList, setWorkspaceList] = useState<WorkspaceSummary[]>(workspaces)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null)
  const [uploadTarget, setUploadTarget] = useState<{ folderPublicId: string | null } | null>(null)

  const dragLabels = useDragLabels(tree)

  useEffect(() => {
    if (!isMounted) {
      return
    }
    // Get search params from the current router state
    const url = new URL(window.location.href)
    const mode = url.searchParams.get("labels")
    if (mode === "display" || mode === "name") {
      setLabelMode(mode)
      return
    }
    setLabelMode("display")
  }, [isMounted, setLabelMode])

  useEffect(() => {
    setWorkspaceList(workspaces)
  }, [workspaces])

  useEffect(() => {
    setTree(initialTree ?? fallbackTree)
    // Initialize expanded folders for this workspace if not already set
    if (workspaceSlug && expandedIds.size === 0) {
      resetExpandedFolders(workspaceSlug, initialTree ?? fallbackTree)
    }
  }, [fallbackTree, initialTree, workspaceSlug, expandedIds.size, resetExpandedFolders])

  // Reset dialog state when switching workspaces to prevent UI leaks
  useEffect(() => {
    if (workspaceSlug && (activeDialog || Object.keys(dialogDraft).length > 0 || createWorkspaceModalOpen)) {
      closeDialog()
      clearDialogDraft()
      closeCreateWorkspaceModal()
    }
    // Only run when workspaceSlug changes, ignore child-route changes
  }, [workspaceSlug, closeDialog, clearDialogDraft, createWorkspaceModalOpen, closeCreateWorkspaceModal])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  )

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) {
      return pointerCollisions
    }

    return rectIntersection(args)
  }, [])

  const toggleFolder = useCallback((id: string) => {
    if (!workspaceSlug) return
    toggleExpandedFolder(workspaceSlug, id)
  }, [workspaceSlug, toggleExpandedFolder])

  const refreshTree = useCallback(async () => {
    if (!hasWorkspace || workspaceSlug == null) {
      return
    }
    setRefreshing(true)
    try {
      // Invalidate the tree query to trigger a refetch
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(workspaceSlug),
      })
      // Note: The tree state will be updated via the props from parent component
      // which has the useQuery hook for tree data
    } finally {
      setRefreshing(false)
    }
  }, [hasWorkspace, workspaceSlug])

  const moveFolder = useCallback(
    async (folderPublicId: string, parentFolderPublicId: string | null) => {
      if (!hasWorkspace || workspaceSlug == null) {
        return
      }
      setRefreshing(true)
      try {
        await moveFolderMutation.mutateAsync({
          workspaceSlug,
          folderPublicId,
          parentId: parentFolderPublicId,
        })
        // Mutation handles invalidation via onSuccess
      } finally {
        setRefreshing(false)
      }
    },
    [hasWorkspace, moveFolderMutation, workspaceSlug]
  )

  const moveNote = useCallback(
    async (notePublicId: string, folderPublicId: string | null) => {
      if (!hasWorkspace || workspaceSlug == null) {
        return
      }
      setRefreshing(true)
      try {
        await moveNoteMutation.mutateAsync({
          workspaceSlug,
          notePublicId,
          folderId: folderPublicId,
        })
        // Mutation handles invalidation via onSuccess
      } finally {
        setRefreshing(false)
      }
    },
    [hasWorkspace, moveNoteMutation, workspaceSlug]
  )

  const findFolderByPublicId = useCallback((publicId: string, nodes: FolderNode[]): FolderNode | null => {
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
  }, [])

  const collectAllNotes = useCallback((nodes: FolderNode[]): NoteSummary[] => {
    const result: NoteSummary[] = []
    const traverse = (folders: FolderNode[]) => {
      folders.forEach((node) => {
        result.push(...node.notes)
        traverse(node.children)
      })
    }
    traverse(nodes)
    return result
  }, [])

  const handleOpenDialog = useCallback((nextDialog: DialogState) => {
    openDialog(nextDialog)
    let draft: { displayName?: string; name?: string; title?: string; error?: string | null } = {}
    if (nextDialog.mode === "rename-folder") {
      draft.displayName = nextDialog.initialDisplayName
      draft.name = nextDialog.initialName
    } else if (nextDialog.mode === "rename-note") {
      draft.displayName = nextDialog.initialTitle
      draft.name = nextDialog.initialName
    } else {
      draft.displayName = ""
      draft.name = ""
    }
    draft.error = null
    setDialogDraft(draft)
  }, [openDialog, setDialogDraft])

  const handleCloseCreateWorkspaceModal = useCallback(() => {
    closeCreateWorkspaceModal()
    setNewWorkspaceName("")
    setCreateWorkspaceError(null)
  }, [closeCreateWorkspaceModal])

  const handleCloseDialog = useCallback(() => {
    closeDialog()
    clearDialogDraft()
  }, [closeDialog, clearDialogDraft])

  const handleRootCreateFolder = useCallback(() => {
    handleOpenDialog({ mode: "create-folder", targetFolderPublicId: null })
  }, [handleOpenDialog])

  const handleRootCreateNote = useCallback(() => {
    handleOpenDialog({ mode: "create-note", targetFolderPublicId: null })
  }, [handleOpenDialog])

  const handleRootUpload = useCallback(() => {
    setUploadTarget({ folderPublicId: null })
  }, [])

  const handleFolderCreateFolder = useCallback((folderPublicId: string) => {
    handleOpenDialog({ mode: "create-folder", targetFolderPublicId: folderPublicId })
  }, [handleOpenDialog])

  const handleFolderCreateNote = useCallback((folderPublicId: string) => {
    handleOpenDialog({ mode: "create-note", targetFolderPublicId: folderPublicId })
  }, [handleOpenDialog])

  const handleFolderRename = useCallback((folderPublicId: string) => {
    const folderNode = findFolderByPublicId(folderPublicId, tree.folders)
    if (!folderNode) return

    handleOpenDialog({
      mode: "rename-folder",
      targetId: folderNode.id ?? null,
      targetPublicId: folderPublicId,
      initialDisplayName: folderNode.displayName,
      initialName: folderNode.name,
    })
  }, [handleOpenDialog, tree, findFolderByPublicId])

  const handleFolderDelete = useCallback((folderPublicId: string) => {
    const folderNode = findFolderByPublicId(folderPublicId, tree.folders)
    if (!folderNode) return

    handleOpenDialog({
      mode: "delete-folder",
      targetPublicId: folderPublicId,
      displayName: folderNode.displayName,
    })
  }, [handleOpenDialog, tree, findFolderByPublicId])

  const handleFolderUpload = useCallback((folderPublicId: string) => {
    setUploadTarget({ folderPublicId: folderPublicId })
  }, [])

  const handleNoteRename = useCallback((notePublicId: string) => {
    const allNotes = [...collectAllNotes(tree.folders), ...tree.rootNotes]
    const note = allNotes.find(n => n.publicId === notePublicId)
    if (!note) return

    handleOpenDialog({
      mode: "rename-note",
      targetId: note.id ?? null,
      targetPublicId: notePublicId,
      initialTitle: note.title,
      initialName: note.name,
    })
  }, [handleOpenDialog, tree, collectAllNotes])

  const handleNoteDelete = useCallback((notePublicId: string) => {
    const allNotes = [...collectAllNotes(tree.folders), ...tree.rootNotes]
    const note = allNotes.find(n => n.publicId === notePublicId)
    if (!note) return

    handleOpenDialog({
      mode: "delete-note",
      targetPublicId: notePublicId,
      title: note.title,
    })
  }, [handleOpenDialog, tree, collectAllNotes])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDrag(parseDragId(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!hasWorkspace) {
        setActiveDrag(null)
        return
      }
      const active = parseDragId(event.active.id)
      const overId = event.over?.id ? String(event.over.id) : null
      setActiveDrag(null)

      if (!active || !overId) {
        return
      }

      const targetFolderPublicId = overId === rootDropId ? null : parseDragId(overId)?.publicId ?? null

      if (active.type === "note") {
        const allNotes = [...collectAllNotes(tree.folders), ...tree.rootNotes]
        const note = allNotes.find(n => n.publicId === active.publicId)
        const currentFolderId = note?.folderId ?? null
        const targetFolderId = targetFolderPublicId ? findFolderByPublicId(targetFolderPublicId, tree.folders)?.id ?? null : null
        if (currentFolderId === targetFolderId) {
          return
        }
        void moveNote(active.publicId, targetFolderPublicId)
        return
      }

      if (active.type === "folder") {
        const folderNode = findFolderByPublicId(active.publicId, tree.folders)
        const currentFolderId = folderNode?.parentPublicId ?? null
        const targetFolderId = targetFolderPublicId ? findFolderByPublicId(targetFolderPublicId, tree.folders)?.publicId ?? null : null
        if (currentFolderId === targetFolderId) {
          return
        }
        void moveFolder(active.publicId, targetFolderPublicId)
        return
      }
    },
    [hasWorkspace, moveFolderMutation, moveNoteMutation, tree, findFolderByPublicId, collectAllNotes]
  )

  const getDialogCopy = (state: DialogState) => {
    if (state.mode === "create-folder") {
      return {
        title: "New folder",
        displayNameLabel: "Display name",
        displayNamePlaceholder: "Untitled folder",
        nameLabel: "Folder name",
        namePlaceholder: "folder-name",
        submitLabel: "Create folder",
      }
    }

    if (state.mode === "create-note") {
      return {
        title: "New note",
        displayNameLabel: "Note title",
        displayNamePlaceholder: "Untitled note",
        nameLabel: "Note name",
        namePlaceholder: "note-name",
        submitLabel: "Create note",
      }
    }

    if (state.mode === "rename-folder") {
      return {
        title: "Rename folder",
        displayNameLabel: "Display name",
        displayNamePlaceholder: "Folder display name",
        nameLabel: "Folder name",
        namePlaceholder: "folder-name",
        submitLabel: "Save changes",
      }
    }

    if (state.mode === "delete-note") {
      return {
        title: "Delete note",
        displayNameLabel: "",
        displayNamePlaceholder: "",
        nameLabel: "",
        namePlaceholder: "",
        submitLabel: "Delete",
      }
    }

    if (state.mode === "delete-folder") {
      return {
        title: "Delete folder",
        displayNameLabel: "",
        displayNamePlaceholder: "",
        nameLabel: "",
        namePlaceholder: "",
        submitLabel: "Delete",
      }
    }

    return {
      title: "Rename note",
      displayNameLabel: "Note title",
      displayNamePlaceholder: "Note title",
      nameLabel: "Note name",
      namePlaceholder: "note-name",
      submitLabel: "Save changes",
    }
  }

  const handleDialogSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!activeDialog) {
        return
      }

      // Check if relevant mutation is in progress
      const isSubmitting = (
        (activeDialog.mode === "create-folder" && createFolderMutation.isPending) ||
        (activeDialog.mode === "create-note" && createNoteMutation.isPending) ||
        (activeDialog.mode === "rename-folder" && updateFolderMutation.isPending) ||
        (activeDialog.mode === "rename-note" && updateNoteMutation.isPending) ||
        (activeDialog.mode === "delete-note" && deleteNoteMutation.isPending) ||
        (activeDialog.mode === "delete-folder" && deleteFolderMutation.isPending)
      )

      if (isSubmitting) {
        return
      }

      const trimmedDisplayName = (dialogDraft.displayName ?? "").trim()
      const trimmedName = (dialogDraft.name ?? "").trim()
      const isFolderDialog = activeDialog.mode === "create-folder" || activeDialog.mode === "rename-folder"
      const isNoteDialog = activeDialog.mode === "create-note" || activeDialog.mode === "rename-note"
      const isDeleteDialog = activeDialog.mode === "delete-note" || activeDialog.mode === "delete-folder"

      if (!trimmedDisplayName && !isDeleteDialog) {
        setDialogDraft({ error: isFolderDialog ? "Please enter a display name." : "Please enter a title." })
        return
      }

      if (isFolderDialog && !trimmedName) {
        setDialogDraft({ error: "Please enter a folder name." })
        return
      }

      if (isNoteDialog && !trimmedName) {
        setDialogDraft({ error: "Please enter a note name." })
        return
      }

      setDialogDraft({ error: null })

      try {
        if (activeDialog.mode === "create-folder") {
          await createFolderMutation.mutateAsync({
            workspaceSlug: workspaceSlug!,
            displayName: trimmedDisplayName,
            name: trimmedName,
            parentId: activeDialog.targetFolderPublicId || undefined,
          })
        }

        if (activeDialog.mode === "create-note") {
          await createNoteMutation.mutateAsync({
            workspaceSlug: workspaceSlug!,
            title: trimmedDisplayName,
            name: trimmedName,
            folderId: activeDialog.targetFolderPublicId || undefined,
          })
        }

        if (activeDialog.mode === "rename-folder") {
          await updateFolderMutation.mutateAsync({
            workspaceSlug: workspaceSlug!,
            folderPublicId: activeDialog.targetPublicId,
            displayName: trimmedDisplayName,
            name: trimmedName,
          })
        }

        if (activeDialog.mode === "rename-note") {
          await updateNoteMutation.mutateAsync({
            workspaceSlug: workspaceSlug!,
            notePublicId: activeDialog.targetPublicId,
            title: trimmedDisplayName,
            name: trimmedName,
          })
        }

        if (activeDialog.mode === "delete-note") {
          await deleteNoteMutation.mutateAsync({
            workspaceSlug: workspaceSlug!,
            notePublicId: activeDialog.targetPublicId,
          })

          if (selectedNotePublicId === activeDialog.targetPublicId) {
            navigate({
              to: '/workspaces/$workspaceSlug',
              params: { workspaceSlug: workspaceSlug! },
              search: (prev: Record<string, unknown>) => {
                // Preserve existing search params (labels)
                return { labels: typeof prev.labels === "string" ? prev.labels : undefined }
              },
            })
          }
        }

        if (activeDialog.mode === "delete-folder") {
          await deleteFolderMutation.mutateAsync({
            workspaceSlug: workspaceSlug!,
            folderPublicId: activeDialog.targetPublicId,
          })

          if (selectedFolderPublicId === activeDialog.targetPublicId) {
            setSelectedFolderPublicId(null)
          }
        }

        handleCloseDialog()
      } catch (error) {
        setDialogDraft({ error: error instanceof Error ? error.message : "Something went wrong. Please try again." })
      }
    },
    [
      handleCloseDialog,
      activeDialog,
      dialogDraft,
      workspaceSlug,
      selectedNotePublicId,
      selectedFolderPublicId,
      navigate,
      createFolderMutation,
      createNoteMutation,
      updateFolderMutation,
      updateNoteMutation,
      deleteNoteMutation,
      deleteFolderMutation,
      setDialogDraft,
    ]
  )

  const handleCreateWorkspace = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const trimmedName = newWorkspaceName.trim()
      if (!trimmedName) {
        setCreateWorkspaceError("Workspace name is required.")
        return
      }

      setCreateWorkspaceError(null)

      try {
        const result = await createWorkspaceMutation.mutateAsync(trimmedName)

        if (result) {
          setWorkspaceList((prev) => [result, ...prev])
          setNewWorkspaceName("")
          closeCreateWorkspaceModal()
          navigate({
            to: '/workspaces/$workspaceSlug',
            params: { workspaceSlug: result.slug },
            search: { labels: undefined },
          })
        } else {
          throw new Error("Failed to create workspace")
        }
      } catch (error) {
        setCreateWorkspaceError(
          error instanceof Error ? error.message : "Unable to create workspace"
        )
      }
  },
    [createWorkspaceMutation, newWorkspaceName, navigate, closeCreateWorkspaceModal]
  )

  const dragLabel = activeDrag
    ? activeDrag.type === "folder"
      ? (() => {
          const folderNode = tree.folders.find(f => f.publicId === activeDrag.publicId)
          const folderId = folderNode?.id
          return labelMode === "name"
            ? (folderId !== undefined ? dragLabels.folderNames.get(folderId) ?? null : null)
            : (folderId !== undefined ? dragLabels.folderDisplayNames.get(folderId) ?? null : null)
        })()
      : (() => {
          const note = [...tree.folders.flatMap(f => f.notes), ...tree.rootNotes].find(n => n.publicId === activeDrag.publicId)
          const noteId = note?.id
          return labelMode === "name"
            ? (() => {
                const noteName = noteId !== undefined ? dragLabels.noteNames.get(noteId) : undefined
                return noteName ? `${noteName}.md` : null
              })()
            : (noteId !== undefined ? dragLabels.noteTitles.get(noteId) ?? null : null)
        })()
    : null

  const dialogCopy = activeDialog ? getDialogCopy(activeDialog) : null
  const activeWorkspace =
    (workspaceSlug != null
      ? workspaceList.find((workspace) => workspace.slug === workspaceSlug) ?? {
        id: 0,
        slug: workspaceSlug,
        name: workspaceName,
      }
      : null) ?? {
      id: 0,
      slug: "",
      name: workspaceName,
    }
  const userName = session?.user?.name ?? session?.user?.email ?? "Unknown user"
  const userEmail = session?.user?.email ?? ""
  const userInitial = userName.trim().charAt(0).toUpperCase() || "U"

  const handleSignOut = useCallback(async () => {
    await apiClient.signOut()
    // Invalidate all queries on sign-out to clear cached data
    queryClient.invalidateQueries({ queryKey: authQueryKeys.session })
    queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all })
    queryClient.invalidateQueries({ queryKey: noteQueryKeys.all })
    window.location.href = "/"
  }, [queryClient])

  const handleLabelModeToggle = useCallback(() => {
    const nextMode = labelMode === "display" ? "name" : "display"
    // Use TanStack Router's navigate with search params
    navigate({
      to: location.pathname,
      search: (prev: Record<string, unknown>) => ({ ...prev, labels: nextMode }),
    })
    setLabelMode(nextMode)
  }, [labelMode, location.pathname, navigate, setLabelMode])

  const handleWorkspaceSwitch = useCallback((slug: string) => {
    navigate({
      to: '/workspaces/$workspaceSlug',
      params: { workspaceSlug: slug },
      search: { labels: undefined },
    })
  }, [navigate])

  return (
    <>
    <Sidebar collapsible="none" className="w-full min-w-[300px] border-r border-border h-svh">
      <SidebarHeader className="gap-3 px-4 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-lg">
                    <FolderIcon className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{activeWorkspace.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Switch workspace
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                align="start"
                side={isMobile ? "bottom" : "right"}
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Workspaces
                </DropdownMenuLabel>
                {workspaceList.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.slug}
                    onClick={() => handleWorkspaceSwitch(workspace.slug)}
                    className="gap-2 p-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border border-border">
                      <FolderIcon className="size-3.5 shrink-0" />
                    </div>
                    {workspace.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onClick={() => {
                    openCreateWorkspaceModal()
                    setNewWorkspaceName("")
                    setCreateWorkspaceError(null)
                  }}
                  className="gap-2 p-2 text-muted-foreground"
                >
                  <div className="flex size-6 items-center justify-center rounded-md border border-dashed border-border">
                    <FolderIcon className="size-3.5 shrink-0" />
                  </div>
                  New workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        {hasWorkspace ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLabelModeToggle}
                className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-accent"
              >
                {labelMode === "display" ? "Show names" : "Show titles"}
              </button>
            {refreshing ? (
              <span className="text-[10px] text-muted-foreground">Refreshing…</span>
            ) : null}
          </div>
        </div>
        ) : null}
      </SidebarHeader>
      <div className="px-4">
        <SidebarSeparator className="mx-0" />
      </div>
      <SidebarContent className="px-4 pb-4 pt-2">
        {hasWorkspace && isMounted ? (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            collisionDetection={collisionDetection}
          >
            <div className="space-y-2">
              <div className="mt-1">
                <RootDropRow
                  onCreateFolder={handleRootCreateFolder}
                  onCreateNote={handleRootCreateNote}
                  onUpload={handleRootUpload}
                />
              </div>
              {tree.rootNotes.length === 0 && tree.folders.length === 0 ? (
                <p className="text-xs text-muted-foreground">No notes or folders yet.</p>
              ) : (
                <div className="space-y-1">
                  {buildTreeItems(tree.folders, tree.rootNotes, labelMode).map((item) => {
                    if (item.type === "folder") {
                      return (
                        <FolderRow
                          key={`folder-${item.node.publicId}`}
                          node={item.node}
                          level={0}
                          expandedIds={expandedIds}
                          toggleFolder={toggleFolder}
                          workspaceSlug={workspaceSlug!}
                          selectedFolderPublicId={selectedFolderPublicId}
                          selectedNotePublicId={selectedNotePublicId}
                          onSelectFolder={() => {}}
                          dragEnabled={dragEnabled}
                          labelMode={labelMode}
                          onCreateFolder={handleFolderCreateFolder}
                          onCreateNote={handleFolderCreateNote}
                          onRenameFolder={handleFolderRename}
                          onDeleteFolder={handleFolderDelete}
                          onUpload={handleFolderUpload}
                          onRenameNote={handleNoteRename}
                          onDeleteNote={handleNoteDelete}
                        />
                      )
                    }

                    return (
                      <NoteRow
                        key={`note-${item.note.publicId}`}
                        workspaceSlug={workspaceSlug!}
                        note={item.note}
                        label={item.label}
                        selectedNotePublicId={selectedNotePublicId}
                        dragEnabled={dragEnabled}
                        onRenameNote={() => handleNoteRename(item.note.publicId)}
                        onDeleteNote={() => handleNoteDelete(item.note.publicId)}
                        level={0}
                      />
                    )
                  })}
                </div>
              )}
            </div>
            <DragOverlay dropAnimation={{ duration: 150, easing: "ease-out" }}>
              <DragPreview item={activeDrag} label={dragLabel} />
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="flex-1 px-4 py-4" />
        )}
      </SidebarContent>
      <div className="px-4">
        <SidebarSeparator className="mx-0" />
      </div>

      {session?.user ? (
        <SidebarFooter className="px-4 pb-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                      {userInitial}
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{userName}</span>
                      {userEmail ? <span className="truncate text-xs">{userEmail}</span> : null}
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side={isMobile ? "bottom" : "right"}
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                        {userInitial}
                      </div>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">{userName}</span>
                        {userEmail ? <span className="truncate text-xs">{userEmail}</span> : null}
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      ) : null}

      {createWorkspaceModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={handleCloseCreateWorkspaceModal} />
          <div
            className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-sm font-semibold text-foreground">Create workspace</div>
            <form className="mt-4 space-y-3" onSubmit={handleCreateWorkspace}>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Workspace name</label>
                <input
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  placeholder="Product planning"
                  autoFocus
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              {createWorkspaceError ? (
                <p className="text-xs text-destructive">{createWorkspaceError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseCreateWorkspaceModal}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createWorkspaceMutation.isPending}
                  className={cn(
                    "rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition",
                    createWorkspaceMutation.isPending && "cursor-not-allowed opacity-60"
                  )}
                >
                  {createWorkspaceMutation.isPending ? "Creating…" : "Create workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {activeDialog && dialogCopy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={handleCloseDialog} />
          <div
            className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-sm font-semibold text-foreground">{dialogCopy.title}</div>
            <form className="mt-4 space-y-3" onSubmit={handleDialogSubmit}>
              {activeDialog.mode === "delete-note" ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to delete &ldquo;{activeDialog.title}&rdquo;? This action cannot be undone.
                  </p>
                </div>
              ) : activeDialog.mode === "delete-folder" ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to delete &ldquo;{activeDialog.displayName}&rdquo;? This will also delete all notes and subfolders. This action cannot be undone.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      {dialogCopy.displayNameLabel}
                    </label>
                    <input
                      value={dialogDraft.displayName ?? ""}
                      onChange={(event) => setDialogDraft({ displayName: event.target.value })}
                      placeholder={dialogCopy.displayNamePlaceholder}
                      autoFocus
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </div>
                  {dialogCopy.nameLabel ? (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        {dialogCopy.nameLabel}
                      </label>
                      <input
                        value={dialogDraft.name ?? ""}
                        onChange={(event) => setDialogDraft({ name: event.target.value })}
                        placeholder={dialogCopy.namePlaceholder}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                    </div>
                  ) : null}
                </>
              )}
              {dialogDraft.error ? (
                <p className="text-xs text-destructive">{dialogDraft.error}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseDialog}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    createFolderMutation.isPending ||
                    createNoteMutation.isPending ||
                    updateFolderMutation.isPending ||
                    updateNoteMutation.isPending ||
                    deleteNoteMutation.isPending ||
                    deleteFolderMutation.isPending
                  }
                  className={cn(
                    "rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition",
                    (createFolderMutation.isPending ||
                      createNoteMutation.isPending ||
                      updateFolderMutation.isPending ||
                      updateNoteMutation.isPending ||
                      deleteNoteMutation.isPending ||
                      deleteFolderMutation.isPending) && "cursor-not-allowed opacity-60"
                  )}
                >
                  {deleteNoteMutation.isPending || deleteFolderMutation.isPending
                    ? "Deleting…"
                    : (createFolderMutation.isPending ||
                        createNoteMutation.isPending ||
                        updateFolderMutation.isPending ||
                        updateNoteMutation.isPending)
                      ? "Saving…"
                      : dialogCopy.submitLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </Sidebar>
    {uploadTarget && workspaceSlug && (
        <MarkdownUpload
          workspaceSlug={workspaceSlug}
          targetFolderPublicId={uploadTarget.folderPublicId}
          open={true}
          onOpenChange={(open) => !open && setUploadTarget(null)}
          onSuccess={refreshTree}
        />
      )}
    </>
  )
}
