import type { ReactNode } from "react"

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import type { WorkspaceTree } from "@/types"
import FolderTree from "./folder-tree"

type WorkspaceSummary = {
  id: number
  slug: string
  name: string
}

type WorkspaceShellProps = {
  children: ReactNode
  workspaceSlug: string | null
  workspaceName: string
  workspaces: WorkspaceSummary[]
  initialTree: WorkspaceTree | null
}

export default function WorkspaceShell({
  children,
  workspaceSlug,
  workspaceName,
  workspaces,
  initialTree,
}: WorkspaceShellProps) {
  return (
    <SidebarProvider>
      <ResizablePanelGroup orientation="horizontal" className="h-svh">
        <ResizablePanel defaultSize={20} minSize={300} maxSize={500}>
          <FolderTree
            workspaceSlug={workspaceSlug}
            workspaceName={workspaceName}
            workspaces={workspaces}
            initialTree={initialTree}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={80}>
          <SidebarInset className="h-svh min-h-0 overflow-hidden">
            {children}
          </SidebarInset>
        </ResizablePanel>
      </ResizablePanelGroup>
    </SidebarProvider>
  )
}
