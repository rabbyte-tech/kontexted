import type { FormEvent, JSX } from "react"
import { cn } from "@/lib/utils"
import type { DialogState } from "@/stores/ui-store"
import type { DialogCopy } from "@/features/folders/types"

/**
 * Props for the TreeItemDialog component.
 * Handles folder/note CRUD operations dialog.
 */
interface TreeItemDialogProps {
  /** The current dialog state, or null if no dialog should be shown */
  activeDialog: DialogState | null
  /** UI copy/labels for the dialog based on the operation type */
  dialogCopy: DialogCopy | null
  /** Current draft values for the dialog inputs */
  dialogDraft: {
    displayName?: string
    name?: string
    error?: string | null
  }
  /** Whether any CRUD operation is currently in progress */
  isSubmitting: boolean
  /** Handler for form submission */
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  /** Handler for closing the dialog */
  onClose: () => void
  /** Handler for updating draft values */
  onDraftChange: (draft: { displayName?: string; name?: string }) => void
}

/**
 * Dialog component for folder and note CRUD operations (create, rename, delete).
 * Renders a modal dialog with appropriate form fields based on the operation type.
 */
export function TreeItemDialog({
  activeDialog,
  dialogCopy,
  dialogDraft,
  isSubmitting,
  onSubmit,
  onClose,
  onDraftChange,
}: TreeItemDialogProps): JSX.Element | null {
  if (!activeDialog || !dialogCopy) {
    return null
  }

  const isDeleteDialog = activeDialog.mode === "delete-note" || activeDialog.mode === "delete-folder"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-sm font-semibold text-foreground">{dialogCopy.title}</div>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          {isDeleteDialog ? (
            <div className="space-y-2">
              {activeDialog.mode === "delete-note" ? (
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete &quot;{activeDialog.title}&quot;? This action cannot be undone.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete &quot;{activeDialog.displayName}&quot;? This will also delete all notes and subfolders. This action cannot be undone.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  {dialogCopy.displayNameLabel}
                </label>
                <input
                  value={dialogDraft.displayName ?? ""}
                  onChange={(event) => onDraftChange({ displayName: event.target.value })}
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
                    onChange={(event) => onDraftChange({ name: event.target.value })}
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
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition",
                isSubmitting && "cursor-not-allowed opacity-60"
              )}
            >
              {isSubmitting ? "Saving…" : dialogCopy.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Props for the CreateWorkspaceDialog component.
 * Handles creating a new workspace.
 */
interface CreateWorkspaceDialogProps {
  /** Whether the dialog should be visible */
  open: boolean
  /** Current value of the workspace name input */
  workspaceName: string
  /** Error message to display, or null if no error */
  error: string | null
  /** Whether workspace creation is currently in progress */
  isSubmitting: boolean
  /** Handler for updating the workspace name */
  onNameChange: (name: string) => void
  /** Handler for form submission */
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  /** Handler for closing the dialog */
  onClose: () => void
}

/**
 * Dialog component for creating a new workspace.
 * Renders a modal dialog with a name input field.
 */
export function CreateWorkspaceDialog({
  open,
  workspaceName,
  error,
  isSubmitting,
  onNameChange,
  onSubmit,
  onClose,
}: CreateWorkspaceDialogProps): JSX.Element | null {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-sm font-semibold text-foreground">Create workspace</div>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Workspace name</label>
            <input
              value={workspaceName}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Product planning"
              autoFocus
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition",
                isSubmitting && "cursor-not-allowed opacity-60"
              )}
            >
              {isSubmitting ? "Creating…" : "Create workspace"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
