 /**
  * Custom hook for folder tree state management and business logic.
  * Extracts all state, handlers, and effects from the FolderTree component.
  * Part of Phase 4 refactoring to separate concerns.
  */
 
 import { useCallback, useEffect, useMemo, useState } from "react"
 import { useNavigate, useLocation } from "@tanstack/react-router"
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
 import { useUIStore, uiSelectors } from "@/stores/ui-store"
 import { type DialogState, type TreeLabelMode, type DialogDraftFields } from "@/stores/ui-store"
 import { queryClient } from "@/lib/query/query-client"
 import { authQueryKeys, workspaceQueryKeys } from "@/lib/query/query-keys"
 import {
   PointerSensor,
   pointerWithin,
   rectIntersection,
   useSensor,
   useSensors,
   type CollisionDetection,
   type DragEndEvent,
   type DragStartEvent,
    type SensorDescriptor,
    type SensorOptions,
 } from "@dnd-kit/core"
 import type { DragItem, DragLabelMap, DialogCopy, WorkspaceSummary } from "@/features/folders/types"
 import { rootDropId } from "@/features/folders/types"
 import {
   parseDragId,
   useMounted,
   useDragLabels,
   findFolderByPublicId,
   collectAllNotes,
 } from "@/features/folders/utils"
 import type { WorkspaceTree } from "@/types"
 import { apiClient } from "@/lib/api-client"
 
 /**
  * Props interface for the useFolderTree hook.
  * Mirrors the original component props for backward compatibility.
  */
 export interface UseFolderTreeProps {
   workspaceSlug: string | null
   workspaceName: string
   workspaces: WorkspaceSummary[]
   initialTree: WorkspaceTree | null
 }
 
 /**
  * Return interface for the useFolderTree hook.
  * Exposes all state, computed values, and handlers needed by the FolderTree component.
  */
 export interface UseFolderTreeReturn {
   // State
   tree: WorkspaceTree
   expandedIds: Set<string>
   activeDialog: DialogState | null
   dialogDraft: DialogDraftFields
   activeDrag: DragItem | null
   uploadTarget: { folderPublicId: string | null } | null
   refreshing: boolean
   selectedNotePublicId: string | null
   selectedFolderPublicId: string | null
   workspaceList: WorkspaceSummary[]
   newWorkspaceName: string
   createWorkspaceError: string | null
   createWorkspaceModalOpen: boolean
   dragEnabled: boolean
   isMounted: boolean
   hasWorkspace: boolean
   labelMode: TreeLabelMode
   activeWorkspace: WorkspaceSummary
 
   // DnD
   sensors: SensorDescriptor<SensorOptions>[]
   collisionDetection: CollisionDetection
 
   // Computed
   dialogCopy: DialogCopy | null
   dragLabel: string | null
   dragLabels: DragLabelMap
   isCreateWorkspaceSubmitting: boolean
   isDialogSubmitting: boolean
 
   // Handlers
   toggleFolder: (id: string) => void
   refreshTree: () => Promise<void>
   handleDialogSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>
   handleDragStart: (event: DragStartEvent) => void
   handleDragEnd: (event: DragEndEvent) => void
   handleOpenDialog: (dialog: DialogState) => void
   handleCloseDialog: () => void
   handleRootCreateFolder: () => void
   handleRootCreateNote: () => void
   handleRootUpload: () => void
   handleFolderCreateFolder: (folderPublicId: string) => void
   handleFolderCreateNote: (folderPublicId: string) => void
   handleFolderRename: (folderPublicId: string) => void
   handleFolderDelete: (folderPublicId: string) => void
   handleFolderUpload: (folderPublicId: string) => void
   handleNoteRename: (notePublicId: string) => void
   handleNoteDelete: (notePublicId: string) => void
   handleCloseCreateWorkspaceModal: () => void
    handleOpenCreateWorkspaceModal: () => void
   handleCreateWorkspace: (e: React.FormEvent<HTMLFormElement>) => Promise<void>
   handleSignOut: () => Promise<void>
   handleLabelModeToggle: () => void
   handleWorkspaceSwitch: (slug: string) => void
   setNewWorkspaceName: (name: string) => void
   setUploadTarget: (target: { folderPublicId: string | null } | null) => void
   setDialogDraft: (draft: Partial<DialogDraftFields>) => void
   getDialogCopy: (state: DialogState) => DialogCopy
 }
 
 /**
  * Custom hook that encapsulates all folder tree state and business logic.
  * Extracts logic from the FolderTree component for better separation of concerns.
  *
  * @param props - The folder tree props containing workspace context and initial data
  * @returns An object containing all state, computed values, and handlers for the folder tree
  */
 export function useFolderTree(props: UseFolderTreeProps): UseFolderTreeReturn {
   const { workspaceSlug, workspaceName, workspaces, initialTree } = props
   const navigate = useNavigate()
   const location = useLocation()
 
   // ============================================================================
   // UI Store Selectors
   // ============================================================================
 
   const labelMode = useUIStore((s) => s.labelMode)
   const expandedIds = useUIStore((s) => uiSelectors.getExpandedFolders(workspaceSlug ?? "")(s))
   const createWorkspaceModalOpen = useUIStore((s) => s.createWorkspaceModalOpen)
   const activeDialog = useUIStore((s) => s.activeDialog)
   const dialogDraft = useUIStore((s) => s.dialogDraft)
 
   const {
     setLabelMode,
     toggleExpandedFolder,
     closeCreateWorkspaceModal,
      openCreateWorkspaceModal,
     openDialog,
     closeDialog,
     setDialogDraft: setDialogDraftInStore,
     clearDialogDraft,
     resetExpandedFolders,
   } = useUIStore()
 
   // ============================================================================
   // Mutation Hooks
   // ============================================================================
 
   const createWorkspaceMutation = useCreateWorkspace()
   const createFolderMutation = useCreateFolder()
   const createNoteMutation = useCreateNote()
   const updateFolderMutation = useUpdateFolder()
   const updateNoteMutation = useUpdateNote()
   const deleteFolderMutation = useDeleteFolder()
   const deleteNoteMutation = useDeleteNote()
   const moveFolderMutation = useMoveFolder()
   const moveNoteMutation = useMoveNote()
 
   // ============================================================================
   // Derived State from Location
   // ============================================================================
 
   const selectedNotePublicId = useMemo(() => {
     const pathParts = location.pathname.split("/")
     const notesIndex = pathParts.indexOf("notes")
     if (notesIndex !== -1 && pathParts.length > notesIndex + 1) {
       const noteId = pathParts[notesIndex + 1]
       if (pathParts[notesIndex + 2] === "history" || pathParts.length === notesIndex + 2) {
         return noteId
       }
     }
     return null
   }, [location.pathname])
 
   // ============================================================================
   // Mount State
   // ============================================================================
 
   const isMounted = useMounted()
   const dragEnabled = isMounted
   const hasWorkspace = workspaceSlug != null
 
   // ============================================================================
   // Local State
   // ============================================================================
 
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
   const [newWorkspaceName, setNewWorkspaceNameState] = useState("")
   const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null)
   const [uploadTarget, setUploadTarget] = useState<{ folderPublicId: string | null } | null>(null)
 
   // ============================================================================
   // Computed Values
   // ============================================================================
 
   const dragLabels = useDragLabels(tree)
 
   // ============================================================================
   // Effects
   // ============================================================================
 
   useEffect(() => {
     if (!isMounted) {
       return
     }
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
   }, [workspaceSlug, closeDialog, clearDialogDraft, createWorkspaceModalOpen, closeCreateWorkspaceModal])
 
   // ============================================================================
   // DnD Sensors and Collision Detection
   // ============================================================================
 
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
 
   // ============================================================================
   // Handlers
   // ============================================================================
 
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
       await queryClient.invalidateQueries({
         queryKey: workspaceQueryKeys.tree(workspaceSlug),
       })
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
       } finally {
         setRefreshing(false)
       }
     },
     [hasWorkspace, moveNoteMutation, workspaceSlug]
   )
 
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
     setDialogDraftInStore(draft)
   }, [openDialog, setDialogDraftInStore])
 

   const handleCloseCreateWorkspaceModal = useCallback(() => {
      closeCreateWorkspaceModal()
      setNewWorkspaceNameState("")
      setCreateWorkspaceError(null)
   }, [closeCreateWorkspaceModal])

   const handleOpenCreateWorkspaceModal = useCallback(() => {
      openCreateWorkspaceModal()
   }, [openCreateWorkspaceModal])

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
          const currentFolderPublicId = note?.folderPublicId ?? null
          if (currentFolderPublicId === targetFolderPublicId) {
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
     [hasWorkspace, moveFolder, moveNote, tree, findFolderByPublicId, collectAllNotes]
   )
 
   const getDialogCopy = useCallback((state: DialogState): DialogCopy => {
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
   }, [])
 
   const handleDialogSubmit = useCallback(
     async (event: React.FormEvent<HTMLFormElement>) => {
       event.preventDefault()
       if (!activeDialog) {
         return
       }
 
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
         setDialogDraftInStore({ error: isFolderDialog ? "Please enter a display name." : "Please enter a title." })
         return
       }
 
       if (isFolderDialog && !trimmedName) {
         setDialogDraftInStore({ error: "Please enter a folder name." })
         return
       }
 
       if (isNoteDialog && !trimmedName) {
         setDialogDraftInStore({ error: "Please enter a note name." })
         return
       }
 
       setDialogDraftInStore({ error: null })
 
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
               search: (prev: Record<string, unknown>) => ({
                 labels: typeof prev.labels === "string" ? prev.labels : undefined
               }),
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
         setDialogDraftInStore({ error: error instanceof Error ? error.message : "Something went wrong. Please try again." })
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
       setDialogDraftInStore,
     ]
   )
 
   const handleCreateWorkspace = useCallback(
     async (event: React.FormEvent<HTMLFormElement>) => {
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
           setNewWorkspaceNameState("")
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
 
   const handleSignOut = useCallback(async () => {
     await apiClient.signOut()
     queryClient.invalidateQueries({ queryKey: authQueryKeys.session })
     queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all })
     queryClient.clear()
     window.location.href = "/"
   }, [queryClient])
 
   const handleLabelModeToggle = useCallback(() => {
     const nextMode = labelMode === "display" ? "name" : "display"
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
 
   // ============================================================================
   // Computed Values for Return
   // ============================================================================
 
   const dragLabel = useMemo(() => {
     if (!activeDrag) return null
 
     if (activeDrag.type === "folder") {
       const folderNode = tree.folders.find(f => f.publicId === activeDrag.publicId)
       const folderId = folderNode?.id
       return labelMode === "name"
         ? (folderId !== undefined ? dragLabels.folderNames.get(folderId) ?? null : null)
         : (folderId !== undefined ? dragLabels.folderDisplayNames.get(folderId) ?? null : null)
     }
 
     const note = [...tree.folders.flatMap(f => f.notes), ...tree.rootNotes].find(n => n.publicId === activeDrag.publicId)
     const noteId = note?.id
     return labelMode === "name"
       ? (() => {
           const noteName = noteId !== undefined ? dragLabels.noteNames.get(noteId) : undefined
           return noteName ? `${noteName}.md` : null
         })()
       : (noteId !== undefined ? dragLabels.noteTitles.get(noteId) ?? null : null)
   }, [activeDrag, tree, labelMode, dragLabels])
 
   const dialogCopy = activeDialog ? getDialogCopy(activeDialog) : null
 
   const activeWorkspace = useMemo(() => {
     if (workspaceSlug != null) {
       return workspaceList.find((workspace) => workspace.slug === workspaceSlug) ?? {
         id: 0,
         slug: workspaceSlug,
         name: workspaceName,
       }
     }
     return {
       id: 0,
       slug: "",
       name: workspaceName,
     }
   }, [workspaceSlug, workspaceList, workspaceName])
 
   const isCreateWorkspaceSubmitting = createWorkspaceMutation.isPending
 
   const isDialogSubmitting = useMemo(() => {
     if (!activeDialog) return false
     return (
       (activeDialog.mode === "create-folder" && createFolderMutation.isPending) ||
       (activeDialog.mode === "create-note" && createNoteMutation.isPending) ||
       (activeDialog.mode === "rename-folder" && updateFolderMutation.isPending) ||
       (activeDialog.mode === "rename-note" && updateNoteMutation.isPending) ||
       (activeDialog.mode === "delete-note" && deleteNoteMutation.isPending) ||
       (activeDialog.mode === "delete-folder" && deleteFolderMutation.isPending)
     )
   }, [activeDialog, createFolderMutation.isPending, createNoteMutation.isPending, updateFolderMutation.isPending, updateNoteMutation.isPending, deleteNoteMutation.isPending, deleteFolderMutation.isPending])
 
   // ============================================================================
   // Setter Functions
   // ============================================================================
 
   const setNewWorkspaceName = useCallback((name: string) => {
     setNewWorkspaceNameState(name)
   }, [])
 
   const setUploadTargetFunc = useCallback((target: { folderPublicId: string | null } | null) => {
     setUploadTarget(target)
   }, [])
 
   const setDialogDraftFunc = useCallback((draft: Partial<DialogDraftFields>) => {
     setDialogDraftInStore(draft)
   }, [setDialogDraftInStore])
 
   // ============================================================================
   // Return
   // ============================================================================
 
   return {
     // State
     tree,
     expandedIds,
     activeDialog,
     dialogDraft,
     activeDrag,
     uploadTarget,
     refreshing,
     selectedNotePublicId,
     selectedFolderPublicId,
     workspaceList,
     newWorkspaceName,
     createWorkspaceError,
     createWorkspaceModalOpen,
     dragEnabled,
     isMounted,
     hasWorkspace,
     labelMode,
     activeWorkspace,
 
     // DnD
     sensors,
     collisionDetection,
 
     // Computed
     dialogCopy,
     dragLabel,
     dragLabels,
     isCreateWorkspaceSubmitting,
     isDialogSubmitting,
 
     // Handlers
     toggleFolder,
     refreshTree,
     handleDialogSubmit,
     handleDragStart,
     handleDragEnd,
     handleOpenDialog,
     handleCloseDialog,
     handleRootCreateFolder,
     handleRootCreateNote,
     handleRootUpload,
     handleFolderCreateFolder,
     handleFolderCreateNote,
     handleFolderRename,
     handleFolderDelete,
     handleFolderUpload,
     handleNoteRename,
     handleNoteDelete,
     handleCloseCreateWorkspaceModal,
      handleOpenCreateWorkspaceModal,
     handleCreateWorkspace,
     handleSignOut,
     handleLabelModeToggle,
     handleWorkspaceSwitch,
     setNewWorkspaceName,
     setUploadTarget: setUploadTargetFunc,
     setDialogDraft: setDialogDraftFunc,
     getDialogCopy,
   }
 }
