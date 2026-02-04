import { useNavigate } from "@tanstack/react-router"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useCreateWorkspace } from "@/features/workspaces/mutations"

export default function CreateWorkspaceCard() {
  const navigate = useNavigate()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const createWorkspaceMutation = useCreateWorkspace()

  const closeCreateModal = () => {
    setIsCreateOpen(false)
    setNewWorkspaceName("")
    setCreateError(null)
  }

  const handleCreateWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = newWorkspaceName.trim()
    if (!trimmedName) {
      setCreateError("Workspace name is required.")
      return
    }

      setCreateError(null)

      try {
        const created = await createWorkspaceMutation.mutateAsync(trimmedName)
        if (!created) {
          throw new Error("Failed to create workspace")
        }
        closeCreateModal()
        navigate({
          to: '/workspaces/$workspaceSlug',
          params: { workspaceSlug: created.slug },
          search: { labels: undefined },
        })
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create workspace")
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-8">
      <Card className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Create a workspace</h2>
          <p className="text-sm text-muted-foreground">
            No workspace selected. Create one to start organizing your context.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          variant="default"
        >
          New workspace
        </Button>
      </Card>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-workspace-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="create-workspace-title" className="text-lg font-semibold text-foreground">
                  Create a workspace
                </h3>
                <p className="text-sm text-muted-foreground">
                  Give your new workspace a memorable name.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={closeCreateModal}
              >
                Close
              </Button>
            </div>
            <form className="mt-6 flex flex-col gap-4" onSubmit={handleCreateWorkspace}>
              <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
                Workspace name
                <input
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-border"
                  placeholder="Product planning"
                  autoFocus
                />
              </label>
              {createError && (
                <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {createError}
                </p>
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCreateModal}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createWorkspaceMutation.isPending}
                >
                  {createWorkspaceMutation.isPending ? "Creating..." : "Create workspace"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
