import { create } from "zustand"
import type { WorkspaceTree } from "@/types"

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Tree label mode - determines how tree items are displayed
 */
export type TreeLabelMode = "display" | "name"

/**
 * Dialog state for folder/note operations
 * Each variant includes the initial data needed for the operation
 */
export type DialogState =
  | {
      mode: "create-folder"
      targetFolderPublicId: string | null
    }
  | {
      mode: "create-note"
      targetFolderPublicId: string | null
    }
  | {
      mode: "rename-folder"
      targetId: number | null
      targetPublicId: string
      initialDisplayName: string
      initialName: string
    }
  | {
      mode: "rename-note"
      targetId: number | null
      targetPublicId: string
      initialTitle: string
      initialName: string
    }
  | {
      mode: "delete-note"
      targetPublicId: string
      title: string
    }
  | {
      mode: "delete-folder"
      targetPublicId: string
      displayName: string
    }

/**
 * Draft fields for active dialog input
 * These are the user's current input values (may differ from initial values)
 */
export interface DialogDraftFields {
  displayName?: string
  name?: string
  nameLocked?: boolean
  title?: string
  error?: string | null
}

// ============================================================================
// Store State Shape
// ============================================================================

interface UIState {
  // Global UI preferences
  labelMode: TreeLabelMode

  // Workspace-specific UI state (keyed by workspace slug)
  expandedFolderIdsByWorkspace: Record<string, Set<string>>

  // Modal state
  createWorkspaceModalOpen: boolean

  // Dialog state
  activeDialog: DialogState | null
  dialogDraft: DialogDraftFields
}

// ============================================================================
// Store Actions
// ============================================================================

interface UIActions {
  // Label mode actions
  setLabelMode: (mode: TreeLabelMode) => void

  // Expanded folder actions (workspace-scoped)
  toggleExpandedFolder: (workspaceSlug: string, folderPublicId: string) => void
  setExpandedFolders: (workspaceSlug: string, folderIds: Set<string>) => void
  resetExpandedFolders: (workspaceSlug: string, tree?: WorkspaceTree) => void
  clearExpandedFoldersForWorkspace: (workspaceSlug: string) => void

  // Create workspace modal actions
  openCreateWorkspaceModal: () => void
  closeCreateWorkspaceModal: () => void

  // Dialog actions
  openDialog: (dialog: DialogState) => void
  closeDialog: () => void
  setDialogDraft: (draft: DialogDraftFields) => void
  clearDialogDraft: () => void
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Collect all folder publicIds from a tree structure
 * Used for initializing expanded state
 */
const collectFolderPublicIds = (nodes: WorkspaceTree["folders"], acc: string[] = []): string[] => {
  nodes.forEach((node) => {
    acc.push(node.publicId)
    collectFolderPublicIds(node.children, acc)
  })
  return acc
}

// Singleton empty Set for stable reference in selectors
// This prevents infinite render loops when using Zustand with React
const EMPTY_SET = new Set<string>()

// ============================================================================
// Store Definition
// ============================================================================

type UIStore = UIState & UIActions

/**
 * Zustand UI Store - Transient UI state only
 *
 * Constraints:
 * - NO server entities in this store
 * - Workspace-specific UI state is keyed by workspace slug
 * - No persistence (transient only)
 *
 * This store is for UI state that needs to persist across route navigation
 * but is not server data (which belongs in React Query).
 */
export const useUIStore = create<UIStore>((set) => ({
  // ============================================================================
  // Initial State
  // ============================================================================
  labelMode: "display",
  expandedFolderIdsByWorkspace: {},
  createWorkspaceModalOpen: false,
  activeDialog: null,
  dialogDraft: {},

  // ============================================================================
  // Label Mode Actions
  // ============================================================================
  setLabelMode: (mode) => set({ labelMode: mode }),

  // ============================================================================
  // Expanded Folder Actions
  // ============================================================================
  toggleExpandedFolder: (workspaceSlug, folderPublicId) => {
    set((state) => {
      const currentSet = state.expandedFolderIdsByWorkspace[workspaceSlug] ?? EMPTY_SET
      const newSet = new Set(currentSet)

      if (newSet.has(folderPublicId)) {
        newSet.delete(folderPublicId)
      } else {
        newSet.add(folderPublicId)
      }

      return {
        expandedFolderIdsByWorkspace: {
          ...state.expandedFolderIdsByWorkspace,
          [workspaceSlug]: newSet,
        },
      }
    })
  },

  setExpandedFolders: (workspaceSlug, folderIds) => {
    set((state) => ({
      expandedFolderIdsByWorkspace: {
        ...state.expandedFolderIdsByWorkspace,
        [workspaceSlug]: new Set(folderIds),
      },
    }))
  },

  resetExpandedFolders: (workspaceSlug, tree) => {
    if (!tree) {
      // If no tree provided, just clear the state
      set((state) => {
        const { [workspaceSlug]: _, ...rest } = state.expandedFolderIdsByWorkspace
        return { expandedFolderIdsByWorkspace: rest }
      })
      return
    }

    const allFolderIds = collectFolderPublicIds(tree.folders)
    set((state) => ({
      expandedFolderIdsByWorkspace: {
        ...state.expandedFolderIdsByWorkspace,
        [workspaceSlug]: new Set(allFolderIds),
      },
    }))
  },

  clearExpandedFoldersForWorkspace: (workspaceSlug) => {
    set((state) => {
      const { [workspaceSlug]: _, ...rest } = state.expandedFolderIdsByWorkspace
      return { expandedFolderIdsByWorkspace: rest }
    })
  },

  // ============================================================================
  // Create Workspace Modal Actions
  // ============================================================================
  openCreateWorkspaceModal: () => set({ createWorkspaceModalOpen: true }),
  closeCreateWorkspaceModal: () => set({ createWorkspaceModalOpen: false }),

  // ============================================================================
  // Dialog Actions
  // ============================================================================
  openDialog: (dialog) => {
    set({
      activeDialog: dialog,
      dialogDraft: {},
    })
  },

  closeDialog: () => {
    set({
      activeDialog: null,
      dialogDraft: {},
    })
  },

  setDialogDraft: (draft) => {
    set((state) => ({
      dialogDraft: {
        ...state.dialogDraft,
        ...draft,
      },
    }))
  },

  clearDialogDraft: () => {
    set({ dialogDraft: {} })
  },
}))

// ============================================================================
// Selectors (for optimized component subscriptions)
// ============================================================================

/**
 * Selector helpers for common derived state
 * Use these in components to avoid unnecessary re-renders
 */
export const uiSelectors = {
  // Get expanded folders for a specific workspace
  getExpandedFolders: (workspaceSlug: string) => (state: UIStore) =>
    state.expandedFolderIdsByWorkspace[workspaceSlug] ?? EMPTY_SET,

  // Check if a folder is expanded in a workspace
  isFolderExpanded: (workspaceSlug: string, folderPublicId: string) => (state: UIStore) => {
    const expandedSet = state.expandedFolderIdsByWorkspace[workspaceSlug]
    return expandedSet?.has(folderPublicId) ?? false
  },

  // Check if any dialog is currently open
  hasActiveDialog: (state: UIStore) => state.activeDialog !== null,

  // Get the current dialog mode (if any)
  getDialogMode: (state: UIStore) => state.activeDialog?.mode ?? null,
}
