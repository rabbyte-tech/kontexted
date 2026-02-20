 import { useQuery } from "@tanstack/react-query"
 import {
   Sidebar,
   SidebarContent,
   useSidebar,
    SidebarSeparator,
 } from "@/components/ui/sidebar"
 import { useFolderTree } from "@/hooks/use-folder-tree"
 import { TreeDndContext } from "./tree-dnd-context"
 import { FolderRow, NoteRow, RootDropRow } from "./tree-rows"
 import { TreeItemDialog, CreateWorkspaceDialog } from "./tree-dialogs"
 import { WorkspaceSwitcher } from "./workspace-switcher"
 import { UserSidebarFooter } from "./user-sidebar-footer"
 import { buildTreeItems } from "@/features/folders/utils"
 import type { FolderTreeProps } from "@/features/folders/types"
 import { sessionQueryOptions } from "@/features/auth/queries"
 import MarkdownUpload from "./markdown-upload"

 export default function FolderTree({
   workspaceSlug,
   workspaceName,
   workspaces,
   initialTree,
 }: FolderTreeProps) {
   const { data: session } = useQuery(sessionQueryOptions)
   const { isMobile } = useSidebar()

   const {
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
     // Mutation states
     isCreateWorkspaceSubmitting,
     isDialogSubmitting,
     // DnD
     sensors,
     collisionDetection,
     // Computed
     dialogCopy,
     dragLabel,
     // Handlers
     toggleFolder,
     refreshTree,
     handleDialogSubmit,
     handleDragStart,
     handleDragEnd,
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
     handleCreateWorkspace,
      handleOpenCreateWorkspaceModal,
     handleSignOut,
     handleLabelModeToggle,
     handleWorkspaceSwitch,
      setNewWorkspaceName,
      setUploadTarget,
      handleDraftChange,
      handleUnlockName,
      namingConvention,
    } = useFolderTree({
     workspaceSlug,
     workspaceName,
     workspaces,
     initialTree,
   })

   return (
     <>
       <Sidebar collapsible="none" className="w-full min-w-[300px] border-r border-border h-svh">
          <WorkspaceSwitcher
            activeWorkspace={activeWorkspace}
            workspaces={workspaceList}
            labelMode={labelMode}
            refreshing={refreshing}
            hasWorkspace={hasWorkspace}
            isMobile={isMobile}
            onSwitchWorkspace={handleWorkspaceSwitch}
            onCreateWorkspace={handleOpenCreateWorkspaceModal}
            onToggleLabelMode={handleLabelModeToggle}
          />

         <div className="px-4">
           <SidebarSeparator className="mx-0" />
         </div>

         <SidebarContent className="px-4 pb-4 pt-2">
           {hasWorkspace && isMounted ? (
             <TreeDndContext
               sensors={sensors}
               collisionDetection={collisionDetection}
               onDragStart={handleDragStart}
               onDragEnd={handleDragEnd}
               activeDrag={activeDrag}
               dragLabel={dragLabel}
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
             </TreeDndContext>
           ) : (
             <div className="flex-1 px-4 py-4" />
           )}
         </SidebarContent>

         <div className="px-4">
           <SidebarSeparator className="mx-0" />
         </div>

         <UserSidebarFooter
           user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? null } : null}
           isMobile={isMobile}
           onSignOut={handleSignOut}
         />

         <CreateWorkspaceDialog
           open={createWorkspaceModalOpen}
           workspaceName={newWorkspaceName}
           error={createWorkspaceError}
           isSubmitting={isCreateWorkspaceSubmitting}
           onNameChange={setNewWorkspaceName}
           onSubmit={handleCreateWorkspace}
           onClose={handleCloseCreateWorkspaceModal}
         />

          <TreeItemDialog
            activeDialog={activeDialog}
            dialogCopy={dialogCopy}
            dialogDraft={dialogDraft}
            isSubmitting={isDialogSubmitting}
            onSubmit={handleDialogSubmit}
            onClose={handleCloseDialog}
            onDraftChange={handleDraftChange}
            onUnlockName={handleUnlockName}
            namingConvention={namingConvention}
          />
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
