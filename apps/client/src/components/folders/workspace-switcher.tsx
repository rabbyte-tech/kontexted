import type { JSX } from "react"
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FolderIcon, ChevronsUpDown } from "lucide-react"
import type { WorkspaceSummary } from "@/features/folders/types"
import type { TreeLabelMode } from "@/stores/ui-store"

/**
 * WorkspaceSwitcherProps
 * Props for the workspace switcher component that displays the current workspace
 * and allows switching between available workspaces.
 */
interface WorkspaceSwitcherProps {
  /** The currently active workspace */
  activeWorkspace: WorkspaceSummary
  /** List of available workspaces to switch between */
  workspaces: WorkspaceSummary[]
  /** Current label display mode for folders */
  labelMode: TreeLabelMode
  /** Whether data is currently being refreshed */
  refreshing: boolean
  /** Whether a workspace is selected/loaded */
  hasWorkspace: boolean
  /** Whether the UI is in mobile view */
  isMobile: boolean
  /** Callback when a workspace is selected */
  onSwitchWorkspace: (slug: string) => void
  /** Callback when create workspace is requested */
  onCreateWorkspace: () => void
  /** Callback when label mode toggle is clicked */
  onToggleLabelMode: () => void
}

/**
 * WorkspaceSwitcher component that displays a dropdown menu for workspace selection
 * and includes controls for label mode toggling and refresh status.
 */
export function WorkspaceSwitcher({
  activeWorkspace,
  workspaces,
  labelMode,
  refreshing,
  hasWorkspace,
  isMobile,
  onSwitchWorkspace,
  onCreateWorkspace,
  onToggleLabelMode,
}: WorkspaceSwitcherProps): JSX.Element {
  return (
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
              {workspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.slug}
                  onClick={() => onSwitchWorkspace(workspace.slug)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-md border border-border">
                    <FolderIcon className="size-3.5 shrink-0" />
                  </div>
                  {workspace.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={onCreateWorkspace}
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
              onClick={onToggleLabelMode}
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
  )
}
