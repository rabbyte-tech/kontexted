import { Hono } from "hono";
import { baseApp } from "@/routes/workspaces/base";
import { app as treeApp } from "@/routes/workspaces/tree";
import { app as eventsApp } from "@/routes/workspaces/events";
import { app as notesApp } from "@/routes/workspaces/notes";
import { app as noteContentApp } from "@/routes/workspaces/note-content";
import { app as foldersApp } from "@/routes/workspaces/folders";
import { app as folderMoveApp } from "@/routes/workspaces/folder-move";
import { app as uploadApp } from "@/routes/workspaces/upload";
import { app as detailApp } from "@/routes/workspaces/detail";

// Compose all sub-routers
const workspacesApp = new Hono()
  .route("/", baseApp)
  .route("/:workspaceSlug", detailApp)
  .route("/:workspaceSlug/tree", treeApp)
  .route("/:workspaceSlug/events", eventsApp)
  .route("/:workspaceSlug/notes", notesApp)
  .route("/:workspaceSlug/folders", foldersApp)
  .route("/:workspaceSlug/folders/:folderId/move", folderMoveApp)
  .route("/:workspaceSlug/upload", uploadApp)
  .route("/:workspaceSlug/notes/:noteId/content", noteContentApp);

export { workspacesApp };
