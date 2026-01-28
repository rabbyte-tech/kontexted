"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
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
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { FolderNode, NoteSummary, WorkspaceTree } from "@/lib/workspace-tree";
import MarkdownUpload from "./markdown-upload";

const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});

const eventTypes = ["folder.created", "note.created", "folder.updated", "note.updated"] as const;
const rootDropId = "root-folder";

type WorkspaceSummary = {
  id: number;
  slug: string;
  name: string;
};

type FolderTreeProps = {
  workspaceSlug: string | null;
  workspaceName: string;
  workspaces: WorkspaceSummary[];
  initialTree: WorkspaceTree | null;
  initialLabelMode: TreeLabelMode;
};

type DragItem = {
  type: "folder" | "note";
  publicId: string;
};

type DialogState =
  | { mode: "create-folder"; targetFolderPublicId: string | null }
  | { mode: "create-note"; targetFolderPublicId: string | null }
  | { mode: "rename-folder"; targetId: number | null; targetPublicId: string; initialDisplayName: string; initialName: string }
  | { mode: "rename-note"; targetId: number | null; targetPublicId: string; initialTitle: string; initialName: string }
  | { mode: "delete-note"; targetPublicId: string; title: string }
  | { mode: "delete-folder"; targetPublicId: string; displayName: string };

const makeDragId = (type: DragItem["type"], publicId: string) => `${type}:${publicId}`;

const parseDragId = (value: string | number): DragItem | null => {
  const raw = String(value);
  const [type, publicId] = raw.split(":");
  if ((type !== "folder" && type !== "note") || !publicId) {
    return null;
  }
  return { type, publicId } as DragItem;
};

const useMounted = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
};

const collectFolderIds = (nodes: FolderNode[], acc: number[] = []) => {
  nodes.forEach((node) => {
    acc.push(node.id);
    collectFolderIds(node.children, acc);
  });
  return acc;
};

const useFolderMaps = (tree: WorkspaceTree) => {
  return useMemo(() => {
    const noteFolderMap = new Map<number, number | null>();

    const traverse = (nodes: FolderNode[]) => {
      nodes.forEach((node) => {
        node.notes.forEach((note) => {
          noteFolderMap.set(note.id, note.folderId ?? null);
        });
        traverse(node.children);
      });
    };

    traverse(tree.folders);
    tree.rootNotes.forEach((note) => {
      noteFolderMap.set(note.id, null);
    });

    return { noteFolderMap };
  }, [tree]);
};

type TreeItem =
  | { type: "folder"; node: FolderNode; label: string }
  | { type: "note"; note: NoteSummary; label: string };

type TreeLabelMode = "display" | "name";

type DragLabelMap = {
  folderDisplayNames: Map<number, string>;
  folderNames: Map<number, string>;
  noteTitles: Map<number, string>;
  noteNames: Map<number, string>;
};

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
  ];

  return items.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "folder" ? -1 : 1;
    }
    return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
  });
};

const useDragLabels = (tree: WorkspaceTree): DragLabelMap => {
  return useMemo(() => {
    const folderDisplayNames = new Map<number, string>();
    const folderNames = new Map<number, string>();
    const noteTitles = new Map<number, string>();
    const noteNames = new Map<number, string>();

    const walk = (nodes: FolderNode[]) => {
      nodes.forEach((node) => {
        folderDisplayNames.set(node.id, node.displayName);
        folderNames.set(node.id, node.name);
        node.notes.forEach((note) => {
          noteTitles.set(note.id, note.title);
          noteNames.set(note.id, note.name);
        });
        walk(node.children);
      });
    };

    walk(tree.folders);
    tree.rootNotes.forEach((note) => {
      noteTitles.set(note.id, note.title);
      noteNames.set(note.id, note.name);
    });

    return { folderDisplayNames, folderNames, noteTitles, noteNames };
  }, [tree]);
};

const isDescendant = (
  folderId: number,
  candidateParentId: number | null,
  parentMap: Map<number, number | null>
) => {
  let current = candidateParentId;
  while (current != null) {
    if (current === folderId) {
      return true;
    }
    current = parentMap.get(current) ?? null;
  }
  return false;
};

const NoteRow = ({
  workspaceSlug,
  note,
  label,
  queryString,
  selectedNotePublicId,
  dragEnabled,
  onRenameNote,
  onDeleteNote,
  level = 0,
}: {
  workspaceSlug: string;
  note: NoteSummary;
  label: string;
  queryString: string;
  selectedNotePublicId: string | null;
  dragEnabled: boolean;
  onRenameNote: () => void;
  onDeleteNote: () => void;
  level?: number;
}) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: makeDragId("note", note.publicId),
  });
  const dragProps = dragEnabled ? { ...listeners, ...attributes } : {};
  const rowStyle = isDragging
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

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
              className="flex-1 truncate"
              href={`/workspaces/${workspaceSlug}/notes/${note.publicId}${queryString}`}
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
  );
};

const RootDropRow = ({
  onCreateFolder,
  onCreateNote,
  onUpload,
}: {
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onUpload: () => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: rootDropId });

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
  );
};

const RootContextMenu = ({
  onCreateFolder,
  onCreateNote,
  onUpload,
}: {
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onUpload: () => void;
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
  );
};

const FolderContextMenu = ({
  onCreateFolder,
  onCreateNote,
  onRenameFolder,
  onDeleteFolder,
  onUpload,
}: {
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onRenameFolder: () => void;
  onDeleteFolder: () => void;
  onUpload: () => void;
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
  );
};

const NoteContextMenu = ({
  onRenameNote,
  onDeleteNote,
}: {
  onRenameNote: () => void;
  onDeleteNote: () => void;
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
  );
};

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
  queryString,
  onCreateFolder,
  onCreateNote,
  onRenameFolder,
  onDeleteFolder,
  onUpload,
  onRenameNote,
  onDeleteNote,
}: {
  node: FolderNode;
  level: number;
  expandedIds: Set<number>;
  toggleFolder: (id: number) => void;
  workspaceSlug: string;
  selectedFolderPublicId: string | null;
  selectedNotePublicId: string | null;
  onSelectFolder: (id: number) => void;
  dragEnabled: boolean;
  labelMode: TreeLabelMode;
  queryString: string;
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onRenameFolder: () => void;
  onDeleteFolder: () => void;
  onUpload: () => void;
  onRenameNote: (notePublicId: string) => void;
  onDeleteNote: (notePublicId: string) => void;
}) => {
  const isExpanded = expandedIds.has(node.id);
  const label = labelMode === "name" ? node.name : node.displayName;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: makeDragId("folder", node.publicId),
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: makeDragId("folder", node.publicId),
  });
  const dragProps = dragEnabled ? { ...listeners, ...attributes } : {};
  const rowStyle = isDragging
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

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
                onClick={() => toggleFolder(node.id)}
                className="text-muted-foreground shrink-0"
                aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <FolderIcon className="h-4 w-4 shrink-0" />
              <button
                type="button"
                onClick={() => onSelectFolder(node.id)}
                className="flex-1 truncate text-left"
              >
                {label}
              </button>
            </div>
          </div>
        </ContextMenuTrigger>
        <FolderContextMenu
          onCreateFolder={onCreateFolder}
          onCreateNote={onCreateNote}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onUpload={onUpload}
        />
      </ContextMenu>
      {isExpanded ? (
        <div className="space-y-1">
          {buildTreeItems(node.children, node.notes, labelMode).map((item) => {
            if (item.type === "folder") {
              return (
                <FolderRow
                  key={`folder-${item.node.id}`}
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
                  queryString={queryString}
                  onCreateFolder={onCreateFolder}
                  onCreateNote={onCreateNote}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onUpload={onUpload}
                  onRenameNote={onRenameNote}
                  onDeleteNote={onDeleteNote}
                />
              );
            }

            return (
              <NoteRow
                key={`note-${item.note.id}`}
                workspaceSlug={workspaceSlug}
                note={item.note}
                label={item.label}
                queryString={queryString}
                selectedNotePublicId={selectedNotePublicId}
                dragEnabled={dragEnabled}
                onRenameNote={() => onRenameNote(item.note.publicId)}
                onDeleteNote={() => onDeleteNote(item.note.publicId)}
                level={level + 1}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const DragPreview = ({
  item,
  label,
}: {
  item: DragItem | null;
  label: string | null;
}) => {
  if (!item) {
    return null;
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
  );
};

export default function FolderTree({
  workspaceSlug,
  workspaceName,
  workspaces,
  initialTree,
  initialLabelMode,
}: FolderTreeProps) {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const selectedNotePublicId = useMemo(() => {
    const noteId = params?.noteId;
    if (typeof noteId !== "string") {
      return null;
    }
    return noteId;
  }, [params]);
  const { isMobile } = useSidebar();

  const isMounted = useMounted();
  const dragEnabled = isMounted;
  const hasWorkspace = workspaceSlug != null;
  const fallbackTree = useMemo<WorkspaceTree>(
    () => ({
      workspaceId: 0,
      workspaceName,
      rootNotes: [],
      folders: [],
    }),
    [workspaceName]
  );
  const [tree, setTree] = useState(initialTree ?? fallbackTree);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    () => new Set(collectFolderIds((initialTree ?? fallbackTree).folders))
  );
  const [selectedFolderPublicId, setSelectedFolderPublicId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [labelMode, setLabelMode] = useState<TreeLabelMode>(initialLabelMode);
  const [activeDrag, setActiveDrag] = useState<DragItem | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogDisplayName, setDialogDisplayName] = useState("");
  const [dialogName, setDialogName] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogSubmitting, setDialogSubmitting] = useState(false);
  const [workspaceList, setWorkspaceList] = useState<WorkspaceSummary[]>(workspaces);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{ folderPublicId: string | null } | null>(null);

  const { noteFolderMap } = useFolderMaps(tree);
  const dragLabels = useDragLabels(tree);

  useEffect(() => {
    if (!isMounted) {
      return;
    }
    const mode = searchParams?.get("labels");
    if (mode === "display" || mode === "name") {
      setLabelMode(mode);
      return;
    }
    setLabelMode("display");
  }, [isMounted, searchParams]);

  useEffect(() => {
    setWorkspaceList(workspaces);
  }, [workspaces]);

  useEffect(() => {
    setTree(initialTree ?? fallbackTree);
    setExpandedIds(new Set(collectFolderIds((initialTree ?? fallbackTree).folders)));
  }, [fallbackTree, initialTree]);

  const queryString = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `?${query}` : "";
  }, [searchParams]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }

    return rectIntersection(args);
  }, []);

  const toggleFolder = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const refreshTree = useCallback(async () => {
    if (!hasWorkspace || workspaceSlug == null) {
      return;
    }
    setRefreshing(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tree`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as WorkspaceTree;
      setTree(payload);
      setExpandedIds((prev) => {
        if (prev.size > 0) {
          return prev;
        }
        return new Set(collectFolderIds(payload.folders));
      });
    } finally {
      setRefreshing(false);
    }
  }, [hasWorkspace, workspaceSlug]);

  const moveFolder = useCallback(
    async (folderPublicId: string, parentFolderPublicId: string | null) => {
      if (!hasWorkspace || workspaceSlug == null) {
        return;
      }
      setRefreshing(true);
      try {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/folders/${folderPublicId}/move`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ parentId: parentFolderPublicId }),
        });
        if (response.ok) {
          await refreshTree();
        }
      } finally {
        setRefreshing(false);
      }
    },
    [hasWorkspace, refreshTree, workspaceSlug]
  );

  const moveNote = useCallback(
    async (notePublicId: string, folderPublicId: string | null) => {
      if (!hasWorkspace || workspaceSlug == null) {
        return;
      }
      setRefreshing(true);
      try {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/notes/${notePublicId}/move`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ folderId: folderPublicId }),
        });
        if (response.ok) {
          await refreshTree();
        }
      } finally {
        setRefreshing(false);
      }
    },
    [hasWorkspace, refreshTree, workspaceSlug]
  );

  const findFolderByPublicId = useCallback((publicId: string, nodes: FolderNode[]): FolderNode | null => {
    for (const node of nodes) {
      if (node.publicId === publicId) {
        return node;
      }
      const found = findFolderByPublicId(publicId, node.children);
      if (found) {
        return found;
      }
    }
    return null;
  }, []);

  const collectAllNotes = useCallback((nodes: FolderNode[]): NoteSummary[] => {
    const result: NoteSummary[] = [];
    const traverse = (folders: FolderNode[]) => {
      folders.forEach((node) => {
        result.push(...node.notes);
        traverse(node.children);
      });
    };
    traverse(nodes);
    return result;
  }, []);

  const handleRootCreateFolder = useCallback(() => {
    openDialog({ mode: "create-folder", targetFolderPublicId: null });
  }, []);

  const handleRootCreateNote = useCallback(() => {
    openDialog({ mode: "create-note", targetFolderPublicId: null });
  }, []);

  const handleRootUpload = useCallback(() => {
    setUploadTarget({ folderPublicId: null });
  }, []);

  const handleFolderCreateFolder = useCallback((folderPublicId: string) => {
    openDialog({ mode: "create-folder", targetFolderPublicId: folderPublicId });
  }, []);

  const handleFolderCreateNote = useCallback((folderPublicId: string) => {
    openDialog({ mode: "create-note", targetFolderPublicId: folderPublicId });
  }, []);

  const handleFolderRename = useCallback((folderPublicId: string) => {
    const folderNode = findFolderByPublicId(folderPublicId, tree.folders);
    if (!folderNode) return;

    openDialog({
      mode: "rename-folder",
      targetId: folderNode.id,
      targetPublicId: folderPublicId,
      initialDisplayName: folderNode.displayName,
      initialName: folderNode.name,
    });
  }, [tree, findFolderByPublicId]);

  const handleFolderDelete = useCallback((folderPublicId: string) => {
    const folderNode = findFolderByPublicId(folderPublicId, tree.folders);
    if (!folderNode) return;

    openDialog({
      mode: "delete-folder",
      targetPublicId: folderPublicId,
      displayName: folderNode.displayName,
    });
  }, [tree, findFolderByPublicId]);

  const handleFolderUpload = useCallback((folderPublicId: string) => {
    setUploadTarget({ folderPublicId: folderPublicId });
  }, []);

  const handleNoteRename = useCallback((notePublicId: string) => {
    const allNotes = [...collectAllNotes(tree.folders), ...tree.rootNotes];
    const note = allNotes.find(n => n.publicId === notePublicId);
    if (!note) return;

    openDialog({
      mode: "rename-note",
      targetId: note.id,
      targetPublicId: notePublicId,
      initialTitle: note.title,
      initialName: note.name,
    });
  }, [tree, collectAllNotes]);

  const handleNoteDelete = useCallback((notePublicId: string) => {
    const allNotes = [...collectAllNotes(tree.folders), ...tree.rootNotes];
    const note = allNotes.find(n => n.publicId === notePublicId);
    if (!note) return;

    openDialog({
      mode: "delete-note",
      targetPublicId: notePublicId,
      title: note.title,
    });
  }, [tree, collectAllNotes]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDrag(parseDragId(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!hasWorkspace) {
        setActiveDrag(null);
        return;
      }
      const active = parseDragId(event.active.id);
      const overId = event.over?.id ? String(event.over.id) : null;
      setActiveDrag(null);

      if (!active || !overId) {
        return;
      }

      const targetFolderPublicId = overId === rootDropId ? null : parseDragId(overId)?.publicId ?? null;

      if (active.type === "note") {
        const allNotes = [...collectAllNotes(tree.folders), ...tree.rootNotes];
        const note = allNotes.find(n => n.publicId === active.publicId);
        const currentFolderId = note?.folderId ?? null;
        const targetFolderId = targetFolderPublicId ? findFolderByPublicId(targetFolderPublicId, tree.folders)?.id ?? null : null;
        if (currentFolderId === targetFolderId) {
          return;
        }
        void moveNote(active.publicId, targetFolderPublicId);
        return;
      }

      if (active.type === "folder") {
        const folderNode = findFolderByPublicId(active.publicId, tree.folders);
        const currentFolderId = folderNode?.parentId ?? null;
        const targetFolderId = targetFolderPublicId ? findFolderByPublicId(targetFolderPublicId, tree.folders)?.id ?? null : null;
        if (currentFolderId === targetFolderId) {
          return;
        }
        void moveFolder(active.publicId, targetFolderPublicId);
        return;
      }
    },
    [hasWorkspace, moveFolder, moveNote, tree, findFolderByPublicId, collectAllNotes]
  );

  useEffect(() => {
    if (!hasWorkspace || workspaceSlug == null) {
      return;
    }
    const source = new EventSource(`/api/workspaces/${workspaceSlug}/events`);
    const handleEvent = () => {
      void refreshTree();
    };

    eventTypes.forEach((eventType) => {
      source.addEventListener(eventType, handleEvent);
    });

    source.addEventListener("ready", handleEvent);

    return () => {
      eventTypes.forEach((eventType) => {
        source.removeEventListener(eventType, handleEvent);
      });
      source.removeEventListener("ready", handleEvent);
      source.close();
    };
  }, [hasWorkspace, refreshTree, workspaceSlug]);

  const openDialog = useCallback((nextDialog: DialogState) => {
    setDialog(nextDialog);
    if (nextDialog.mode === "rename-folder") {
      setDialogDisplayName(nextDialog.initialDisplayName);
      setDialogName(nextDialog.initialName);
    } else if (nextDialog.mode === "rename-note") {
      setDialogDisplayName(nextDialog.initialTitle);
      setDialogName(nextDialog.initialName);
    } else {
      setDialogDisplayName("");
      setDialogName("");
    }
    setDialogError(null);
  }, []);

  const closeCreateWorkspaceModal = useCallback(() => {
    setIsCreateWorkspaceOpen(false);
    setNewWorkspaceName("");
    setCreateWorkspaceError(null);
  }, []);

  const closeDialog = useCallback(() => {
    setDialog(null);
    setDialogDisplayName("");
    setDialogName("");
    setDialogError(null);
    setDialogSubmitting(false);
  }, []);

  const getDialogCopy = (state: DialogState) => {
    if (state.mode === "create-folder") {
      return {
        title: "New folder",
        displayNameLabel: "Display name",
        displayNamePlaceholder: "Untitled folder",
        nameLabel: "Folder name",
        namePlaceholder: "folder-name",
        submitLabel: "Create folder",
      };
    }

    if (state.mode === "create-note") {
      return {
        title: "New note",
        displayNameLabel: "Note title",
        displayNamePlaceholder: "Untitled note",
        nameLabel: "Note name",
        namePlaceholder: "note-name",
        submitLabel: "Create note",
      };
    }

    if (state.mode === "rename-folder") {
      return {
        title: "Rename folder",
        displayNameLabel: "Display name",
        displayNamePlaceholder: "Folder display name",
        nameLabel: "Folder name",
        namePlaceholder: "folder-name",
        submitLabel: "Save changes",
      };
    }

    if (state.mode === "delete-note") {
      return {
        title: "Delete note",
        displayNameLabel: "",
        displayNamePlaceholder: "",
        nameLabel: "",
        namePlaceholder: "",
        submitLabel: "Delete",
      };
    }

    if (state.mode === "delete-folder") {
      return {
        title: "Delete folder",
        displayNameLabel: "",
        displayNamePlaceholder: "",
        nameLabel: "",
        namePlaceholder: "",
        submitLabel: "Delete",
      };
    }

    return {
      title: "Rename note",
      displayNameLabel: "Note title",
      displayNamePlaceholder: "Note title",
      nameLabel: "Note name",
      namePlaceholder: "note-name",
      submitLabel: "Save changes",
    };
  };

  const handleDialogSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!dialog || dialogSubmitting) {
        return;
      }

      const trimmedDisplayName = dialogDisplayName.trim();
      const trimmedName = dialogName.trim();
      const isFolderDialog = dialog.mode === "create-folder" || dialog.mode === "rename-folder";
      const isNoteDialog = dialog.mode === "create-note" || dialog.mode === "rename-note";
      const isDeleteDialog = dialog.mode === "delete-note" || dialog.mode === "delete-folder";

      if (!trimmedDisplayName && !isDeleteDialog) {
        setDialogError(isFolderDialog ? "Please enter a display name." : "Please enter a title.");
        return;
      }

      if (isFolderDialog && !trimmedName) {
        setDialogError("Please enter a folder name.");
        return;
      }

      if (isNoteDialog && !trimmedName) {
        setDialogError("Please enter a note name.");
        return;
      }

      setDialogSubmitting(true);
      setDialogError(null);

      const handleError = async (response: Response) => {
        const payload = await response.json().catch(() => null);
        if (payload && typeof payload === "object" && "error" in payload) {
          const errorValue = (payload as { error?: unknown }).error;
          if (typeof errorValue === "string") {
            return errorValue;
          }
        }
        return "Something went wrong. Please try again.";
      };

      try {
        let response: Response | null = null;

        if (dialog.mode === "create-folder") {
          response = await fetch(`/api/workspaces/${workspaceSlug}/folders`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              displayName: trimmedDisplayName,
              name: trimmedName,
              parentId: dialog.targetFolderPublicId,
            }),
          });
        }

        if (dialog.mode === "create-note") {
          response = await fetch(`/api/workspaces/${workspaceSlug}/notes`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: trimmedDisplayName,
              name: trimmedName,
              folderId: dialog.targetFolderPublicId,
            }),
          });
        }

         if (dialog.mode === "rename-folder") {
           response = await fetch(
             `/api/workspaces/${workspaceSlug}/folders/${dialog.targetPublicId}`,
             {
               method: "PATCH",
               headers: {
                 "Content-Type": "application/json",
               },
               body: JSON.stringify({
                 displayName: trimmedDisplayName,
                 name: trimmedName,
               }),
             }
           );
         }

         if (dialog.mode === "rename-note") {
           response = await fetch(`/api/workspaces/${workspaceSlug}/notes/${dialog.targetPublicId}`, {
             method: "PATCH",
             headers: {
               "Content-Type": "application/json",
             },
             body: JSON.stringify({
               title: trimmedDisplayName,
               name: trimmedName,
             }),
           }
           );
         }

         if (dialog.mode === "delete-note") {
           response = await fetch(`/api/workspaces/${workspaceSlug}/notes/${dialog.targetPublicId}`, {
             method: "DELETE",
           });
         }

         if (dialog.mode === "delete-folder") {
           response = await fetch(`/api/workspaces/${workspaceSlug}/folders/${dialog.targetPublicId}`, {
             method: "DELETE",
           });
         }

        if (!response) {
          setDialogError("Something went wrong. Please try again.");
          return;
        }

        if (!response.ok) {
          setDialogError(await handleError(response));
          return;
        }

        if (dialog.mode === "delete-note" && selectedNotePublicId === dialog.targetPublicId) {
          router.push(`/workspaces/${workspaceSlug}${queryString}`);
        }

        if (dialog.mode === "delete-folder" && selectedFolderPublicId === dialog.targetPublicId) {
          setSelectedFolderPublicId(null);
        }

        await refreshTree();
        closeDialog();
      } catch (error) {
        setDialogError("Something went wrong. Please try again.");
      } finally {
        setDialogSubmitting(false);
      }
    },
    [closeDialog, dialog, dialogSubmitting, dialogDisplayName, dialogName, refreshTree, workspaceSlug, selectedNotePublicId, queryString, router]
  );

  const handleCreateWorkspace = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedName = newWorkspaceName.trim();
      if (!trimmedName) {
        setCreateWorkspaceError("Workspace name is required.");
        return;
      }

      setIsCreatingWorkspace(true);
      setCreateWorkspaceError(null);

      try {
        const response = await fetch("/api/workspaces", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: trimmedName }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => null);
          throw new Error(error?.error ?? "Unable to create workspace");
        }

        const created = (await response.json()) as WorkspaceSummary;
        setWorkspaceList((prev) => [created, ...prev]);
        setNewWorkspaceName("");
        setIsCreateWorkspaceOpen(false);
        router.push(`/workspaces/${created.slug}${queryString}`);
      } catch (error) {
        setCreateWorkspaceError(
          error instanceof Error ? error.message : "Unable to create workspace"
        );
      } finally {
        setIsCreatingWorkspace(false);
      }
    },
    [newWorkspaceName, queryString, router]
  );

  const dragLabel = activeDrag
    ? activeDrag.type === "folder"
      ? (() => {
          const folderNode = tree.folders.find(f => f.publicId === activeDrag.publicId);
          const folderId = folderNode?.id;
          return labelMode === "name"
            ? (folderId !== undefined ? dragLabels.folderNames.get(folderId) ?? null : null)
            : (folderId !== undefined ? dragLabels.folderDisplayNames.get(folderId) ?? null : null);
        })()
      : (() => {
          const note = [...tree.folders.flatMap(f => f.notes), ...tree.rootNotes].find(n => n.publicId === activeDrag.publicId);
          const noteId = note?.id;
          return labelMode === "name"
            ? (() => {
                const noteName = noteId !== undefined ? dragLabels.noteNames.get(noteId) : undefined;
                return noteName ? `${noteName}.md` : null;
              })()
            : (noteId !== undefined ? dragLabels.noteTitles.get(noteId) ?? null : null);
        })()
    : null;

  const dialogCopy = dialog ? getDialogCopy(dialog) : null;
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
    };
  const userName = session?.user?.name ?? session?.user?.email ?? "Unknown user";
  const userEmail = session?.user?.email ?? "";
  const userInitial = userName.trim().charAt(0).toUpperCase() || "U";

  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
    window.location.href = "/";
  }, []);

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
                    onClick={() => router.push(`/workspaces/${workspace.slug}${queryString}`)}
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
                    setIsCreateWorkspaceOpen(true);
                    setNewWorkspaceName("");
                    setCreateWorkspaceError(null);
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
                onClick={() => {
                  const nextMode = labelMode === "display" ? "name" : "display";
                  const nextParams = new URLSearchParams(searchParams?.toString());
                  nextParams.set("labels", nextMode);
                  router.replace(`?${nextParams.toString()}`);
                  setLabelMode(nextMode);
                }}
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
                          workspaceSlug={workspaceSlug}
                          selectedFolderPublicId={selectedFolderPublicId}
                          selectedNotePublicId={selectedNotePublicId}
                          onSelectFolder={() => {}}
                          dragEnabled={dragEnabled}
                          labelMode={labelMode}
                          queryString={queryString}
                          onCreateFolder={() => handleFolderCreateFolder(item.node.publicId)}
                          onCreateNote={() => handleFolderCreateNote(item.node.publicId)}
                          onRenameFolder={() => handleFolderRename(item.node.publicId)}
                          onDeleteFolder={() => handleFolderDelete(item.node.publicId)}
                          onUpload={() => handleFolderUpload(item.node.publicId)}
                          onRenameNote={handleNoteRename}
                          onDeleteNote={handleNoteDelete}
                        />
                      );
                    }

                    return (
                      <NoteRow
                        key={`note-${item.note.publicId}`}
                        workspaceSlug={workspaceSlug}
                        note={item.note}
                        label={item.label}
                        queryString={queryString}
                        selectedNotePublicId={selectedNotePublicId}
                        dragEnabled={dragEnabled}
                        onRenameNote={() => handleNoteRename(item.note.publicId)}
                        onDeleteNote={() => handleNoteDelete(item.note.publicId)}
                        level={0}
                      />
                    );
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

      {isCreateWorkspaceOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeCreateWorkspaceModal} />
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
                  onClick={closeCreateWorkspaceModal}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingWorkspace}
                  className={cn(
                    "rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition",
                    isCreatingWorkspace && "cursor-not-allowed opacity-60"
                  )}
                >
                  {isCreatingWorkspace ? "Creating…" : "Create workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {dialog && dialogCopy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeDialog} />
          <div
            className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-sm font-semibold text-foreground">{dialogCopy.title}</div>
            <form className="mt-4 space-y-3" onSubmit={handleDialogSubmit}>
              {dialog.mode === "delete-note" ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to delete "{dialog.title}"? This action cannot be undone.
                  </p>
                </div>
              ) : dialog.mode === "delete-folder" ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to delete "{dialog.displayName}"? This will also delete all notes and subfolders. This action cannot be undone.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      {dialogCopy.displayNameLabel}
                    </label>
                    <input
                      value={dialogDisplayName}
                      onChange={(event) => setDialogDisplayName(event.target.value)}
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
                        value={dialogName}
                        onChange={(event) => setDialogName(event.target.value)}
                        placeholder={dialogCopy.namePlaceholder}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                    </div>
                  ) : null}
                </>
              )}
              {dialogError ? (
                <p className="text-xs text-destructive">{dialogError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dialogSubmitting}
                  className={cn(
                    "rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition",
                    dialogSubmitting && "cursor-not-allowed opacity-60",
                    (dialog.mode === "delete-note" || dialog.mode === "delete-folder") && "bg-destructive hover:bg-destructive/90"
                  )}
                >
                  {dialogSubmitting ? "Deleting…" : dialogCopy.submitLabel}
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
  );
}
