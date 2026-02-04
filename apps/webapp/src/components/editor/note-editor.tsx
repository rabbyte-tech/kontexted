"use client";

import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";
import createDOMPurify, { type WindowLike } from "dompurify";
import { marked } from "marked";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Code, SquareSplitHorizontal, Eye, Wifi, Loader2, WifiOff, MoreHorizontal, History, GitCommit } from "lucide-react";
import { Compartment, EditorState } from "@codemirror/state";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  EditorView,
  GutterMarker,
  gutter,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { WebsocketProvider } from "y-websocket";
import { yCollab } from "y-codemirror.next";
import * as Y from "yjs";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getPublicEnv } from "@/public-env";

const env = getPublicEnv();

const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});

type ConnectionStatus = "connected" | "connecting" | "disconnected";

type ViewMode = "code" | "split" | "preview";

// Determine if running in manual-save mode (no collab URL configured)
const isManualMode = !env.PUBLIC_COLLAB_URL;

type SessionData =
  | {
      user?: { id?: string | null; name?: string | null; email?: string | null };
    }
  | null
  | undefined;

  const statusIcon = {
    connected: <Wifi className="h-3.5 w-3.5" />,
    connecting: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    disconnected: <WifiOff className="h-3.5 w-3.5" />,
  };

const colorPalette = ["#7C3AED", "#2563EB", "#059669", "#EA580C", "#DB2777"];

type BlameEntry = {
  lineNumber: number;
  authorUserId: string;
  authorName: string | null;
  authorEmail: string | null;
  revisionId: number;
  touchedAt: string | Date;
};

interface NoteEditorProps {
  workspaceId: number;
  workspaceSlug: string;
  noteId: number;
  notePublicId: string;
  title: string;
  name: string;
  initialContent: string;
  initialUpdatedAt: string;
  initialBlame: BlameEntry[];
}

class BlameMarker extends GutterMarker {
  constructor(private label: string, private tooltip: string) {
    super();
  }

  toDOM() {
    const element = document.createElement("div");
    element.className = "cm-blame-marker text-[13px] text-muted-foreground";
    element.textContent = this.label;
    element.style.maxWidth = "140px";
    element.style.whiteSpace = "nowrap";
    element.style.overflow = "hidden";
    element.style.textOverflow = "ellipsis";
    if (this.tooltip) {
      element.title = this.tooltip;
    }
    return element;
  }
}

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getDisplayName = (session: SessionData, fallbackId: string) => {
  return (
    session?.user?.name ??
    session?.user?.email ??
    `Guest ${fallbackId.slice(-4)}`
  );
};

const applyAwareness = (
  provider: WebsocketProvider | null,
  session: SessionData,
  color: string
) => {
  if (!provider || !session?.user) {
    return;
  }

  const userId = session.user.id ?? session.user.email ?? "anonymous";

  provider.awareness.setLocalStateField("user", {
    id: userId,
    name: getDisplayName(session, userId),
    color,
  });
};

export default function NoteEditor({
  workspaceId,
  workspaceSlug,
  noteId,
  notePublicId,
  title,
  name,
  initialContent,
  initialUpdatedAt,
  initialBlame,
}: NoteEditorProps) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const refreshPromiseRef = useRef<Promise<string> | null>(null);
  const blameCompartmentRef = useRef(new Compartment());
  const contentRef = useRef(initialContent);
  const statusMapRef = useRef<Y.Map<unknown> | null>(null);
  const statusObserverRef = useRef<(() => void) | null>(null);
  const hasLocalEditsRef = useRef(false);
  const awarenessCleanupRef = useRef<(() => void) | null>(null);
  const scrollSyncLockRef = useRef<"editor" | "preview" | null>(null);
  const storageKey = `note-editor-${workspaceSlug}-${notePublicId}`;
  const editorScrollRatioRef = useRef(0);
  const previewScrollRatioRef = useRef(0);
  const scrollSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const viewParam = useMemo(() => {
    const mode = searchParams?.get("view");
    return mode === "code" || mode === "preview" || mode === "split" ? mode : "split";
  }, [searchParams]);
  const [viewMode, setViewMode] = useState<ViewMode>(viewParam);
  const [content, setContent] = useState(initialContent);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(() =>
    initialUpdatedAt ? new Date(initialUpdatedAt) : null
  );
  const [saveState, setSaveState] = useState<"pending" | "saving" | "saved" | "error">(
    "saved"
  );
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [activeUsers, setActiveUsers] = useState<
    { id: string; name: string; color: string }[]
  >([]);
  const [blameEntries, setBlameEntries] = useState<BlameEntry[]>(initialBlame);
  const [showBlame, setShowBlame] = useState(false);

  useEffect(() => {
    setViewMode(viewParam);
  }, [viewParam]);

  const clampScrollRatio = useCallback((ratio: number) => {
    return Math.min(1, Math.max(0, ratio));
  }, []);

  const getPreviewScrollRatio = useCallback(
    (element: HTMLElement) => {
      const maxScroll = element.scrollHeight - element.clientHeight;
      return maxScroll > 0 ? clampScrollRatio(element.scrollTop / maxScroll) : 0;
    },
    [clampScrollRatio]
  );

  const applyPreviewScrollRatio = useCallback(
    (element: HTMLElement, ratio: number) => {
      const maxScroll = element.scrollHeight - element.clientHeight;
      if (maxScroll <= 0) {
        return;
      }
      element.scrollTop = clampScrollRatio(ratio) * maxScroll;
    },
    [clampScrollRatio]
  );

  const getEditorScrollRatio = useCallback(
    (view: EditorView) => {
      const scrollElement = view.scrollDOM;
      const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
      return maxScroll > 0 ? clampScrollRatio(scrollElement.scrollTop / maxScroll) : 0;
    },
    [clampScrollRatio]
  );

  const scrollEditorToRatio = useCallback(
    (view: EditorView, ratio: number) => {
      const scrollElement = view.scrollDOM;
      const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
      if (maxScroll <= 0) {
        return;
      }
      scrollElement.scrollTop = clampScrollRatio(ratio) * maxScroll;
    },
    [clampScrollRatio]
  );

  const updateViewMode = useCallback(
    (nextMode: ViewMode) => {
      setViewMode(nextMode);
      const params = new URLSearchParams(searchParams?.toString());
      params.set("view", nextMode);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const labelMode = useMemo(() => {
    const mode = searchParams?.get("labels");
    return mode === "name" ? "name" : "display";
  }, [searchParams]);

  const displayTitle = useMemo(() => {
    return labelMode === "name" ? `${name}.md` : title;
  }, [labelMode, name, title]);

  const awarenessColor = useMemo(() => {
    const seed = session?.user?.id ?? session?.user?.email ?? "anonymous";
    return colorPalette[hashString(seed) % colorPalette.length];
  }, [session?.user?.email, session?.user?.id]);

  const updateActiveUsers = useCallback(() => {
    const provider = providerRef.current;
    if (!provider) {
      return;
    }
    const entries = Array.from(provider.awareness.getStates().entries());
    const users = entries
      .map(([clientId, state]) => {
        const user = state.user as { id?: string; name?: string; color?: string };
        if (!user) {
          return null;
        }
        const id = user.id ?? `client-${clientId}`;
        const fallbackLabel = `Guest ${String(id).slice(-4)}`;
        return {
          id,
          name: user.name ?? fallbackLabel,
          color: user.color ?? "#94a3b8",
        };
      })
      .filter((user): user is { id: string; name: string; color: string } => Boolean(user));
    const unique = new Map<string, { id: string; name: string; color: string }>();
    users.forEach((user) => {
      if (!unique.has(user.id)) {
        unique.set(user.id, user);
      }
    });
    setActiveUsers(Array.from(unique.values()));
  }, []);

  const dompurify = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return createDOMPurify(window as WindowLike);
  }, []);

  const renderMarkdown = useCallback((value: string) => {
    return marked.parse(value, { breaks: true }) as string;
  }, []);

  const previewHtml = useMemo(() => {
    const rawHtml = renderMarkdown(content);
    return dompurify ? dompurify.sanitize(rawHtml) : rawHtml;
  }, [content, dompurify, renderMarkdown]);

  const blameByLine = useMemo(() => {
    return new Map(blameEntries.map((entry) => [entry.lineNumber, entry]));
  }, [blameEntries]);
  const formatAuthor = (entry?: BlameEntry) => {
    if (!entry) {
      return "Unknown";
    }
    return entry.authorName ?? entry.authorEmail ?? entry.authorUserId;
  };

  const maxVisibleUsers = 3;
  const visibleUsers = useMemo(
    () => activeUsers.slice(0, maxVisibleUsers),
    [activeUsers]
  );
  const overflowUsers = useMemo(
    () => activeUsers.slice(maxVisibleUsers),
    [activeUsers]
  );
  const overflowCount = activeUsers.length - visibleUsers.length;
  const overflowLabel = overflowUsers.map((user) => user.name).join(", ");

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  useEffect(() => {
    applyAwareness(providerRef.current, session, awarenessColor);
    updateActiveUsers();
  }, [awarenessColor, session, updateActiveUsers]);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    setBlameEntries(initialBlame);
  }, [initialBlame]);

  useEffect(() => {
    setLastSavedAt(initialUpdatedAt ? new Date(initialUpdatedAt) : null);
    setHasLocalEdits(false);
    setSaveState("saved");
  }, [initialUpdatedAt]);

  useEffect(() => {
    hasLocalEditsRef.current = hasLocalEdits;
  }, [hasLocalEdits]);

  useEffect(() => {
    if (viewMode !== "preview") {
      editorViewRef.current?.requestMeasure();
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "split" || !ready) {
      return;
    }

    const view = editorViewRef.current;
    const previewPane = previewPaneRef.current;

    if (!view || !previewPane) {
      return;
    }

    const isSyncingRef = { current: false };

    const handleEditorScroll = () => {
      if (isSyncingRef.current || scrollSyncLockRef.current === "preview") {
        return;
      }
      isSyncingRef.current = true;
      scrollSyncLockRef.current = "editor";
      editorScrollRatioRef.current = getEditorScrollRatio(view);
      applyPreviewScrollRatio(previewPane, editorScrollRatioRef.current);
      if (scrollSyncTimeoutRef.current) {
        clearTimeout(scrollSyncTimeoutRef.current);
      }
      scrollSyncTimeoutRef.current = setTimeout(() => {
        isSyncingRef.current = false;
        scrollSyncLockRef.current = null;
      }, 50);
    };

    const handlePreviewScroll = () => {
      if (isSyncingRef.current || scrollSyncLockRef.current === "editor") {
        return;
      }
      isSyncingRef.current = true;
      scrollSyncLockRef.current = "preview";
      previewScrollRatioRef.current = getPreviewScrollRatio(previewPane);
      scrollEditorToRatio(view, previewScrollRatioRef.current);
      if (scrollSyncTimeoutRef.current) {
        clearTimeout(scrollSyncTimeoutRef.current);
      }
      scrollSyncTimeoutRef.current = setTimeout(() => {
        isSyncingRef.current = false;
        scrollSyncLockRef.current = null;
      }, 50);
    };

    view.scrollDOM.addEventListener("scroll", handleEditorScroll, { passive: true });
    previewPane.addEventListener("scroll", handlePreviewScroll, { passive: true });

    return () => {
      if (scrollSyncTimeoutRef.current) {
        clearTimeout(scrollSyncTimeoutRef.current);
      }
      view.scrollDOM.removeEventListener("scroll", handleEditorScroll);
      previewPane.removeEventListener("scroll", handlePreviewScroll);
    };
  }, [
    applyPreviewScrollRatio,
    getEditorScrollRatio,
    getPreviewScrollRatio,
    scrollEditorToRatio,
    viewMode,
    ready,
  ]);

  useEffect(() => {
    if (sessionPending || !session?.user) {
      return;
    }

    let isActive = true;
    const abortController = new AbortController();

    const setupEditor = async () => {
      setStatus("connecting");
      setError(null);
      setReady(false);

      try {
        // Manual-save mode: Initialize CodeMirror with local content only
        if (isManualMode) {
          if (!editorHostRef.current || !isActive) {
            return;
          }

          setStatus("connected");

          const view = new EditorView({
            state: EditorState.create({
              doc: initialContent,
              extensions: [
                keymap.of(defaultKeymap),
                syntaxHighlighting(defaultHighlightStyle),
                lineNumbers(),
                highlightActiveLineGutter(),
                highlightActiveLine(),
                markdown(),
                EditorView.lineWrapping,
                blameCompartmentRef.current.of(createBlameGutter()),
                EditorView.updateListener.of((update) => {
                  if (update.docChanged) {
                    setContent(update.state.doc.toString());
                    setHasLocalEdits(true);
                    setSaveState("pending");
                  }
                }),
              ],
            }),
            parent: editorHostRef.current,
          });

          editorViewRef.current = view;
          setReady(true);
          return;
        }

        // Collab mode: Initialize with Yjs/WebSocket providers
        const fetchToken = async () => {
          const response = await fetch("/api/collab/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ workspaceId: workspaceSlug, noteId: notePublicId }),
            signal: abortController.signal,
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const message =
              typeof payload?.error === "string"
                ? payload.error
                : "Failed to fetch collab token";
            throw new Error(message);
          }

          return (await response.json()) as { token: string; expiresAt: number };
        };

        const refreshToken = async (provider: WebsocketProvider) => {
          if (refreshPromiseRef.current) {
            return refreshPromiseRef.current;
          }

          const promise = fetchToken()
            .then(({ token }) => {
              provider.params.token = token;
              return token;
            })
            .finally(() => {
              refreshPromiseRef.current = null;
            });

          refreshPromiseRef.current = promise;
          return promise;
        };

        const { token } = await fetchToken();

        if (!editorHostRef.current || !isActive) {
          return;
        }

        const doc = new Y.Doc();
        docRef.current = doc;
        const yText = doc.getText("content");

        const collabUrl = env.PUBLIC_COLLAB_URL;
        if (!collabUrl) {
          throw new Error("PUBLIC_COLLAB_URL environment variable is not set");
        }
        const wsUrl = new URL("/ws", collabUrl);
        wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

        const provider = new WebsocketProvider(
          wsUrl.toString(),
          `${workspaceSlug}/${notePublicId}`,
          doc,
          {
            params: { token },
          }
        );

        providerRef.current = provider;
        applyAwareness(provider, session, awarenessColor);

        const handleAwarenessChange = () => {
          updateActiveUsers();
        };

        updateActiveUsers();
        provider.awareness.on("change", handleAwarenessChange);
        awarenessCleanupRef.current = () => {
          provider.awareness.off("change", handleAwarenessChange);
        };

        provider.on("status", ({ status: nextStatus }: { status: string }) => {
          if (!isActive) {
            return;
          }
          setStatus(nextStatus === "connected" ? "connected" : "disconnected");
          if (nextStatus === "disconnected") {
            void refreshToken(provider)
              .then(() => provider.connect())
              .catch((error) => {
                if (!isActive) {
                  return;
                }
                setError(error instanceof Error ? error.message : "Token refresh failed");
              });
          }
        });
        provider.on("sync", (isSynced: boolean) => {
          if (!isActive || !isSynced) {
            return;
          }
          const savedContent = sessionStorage.getItem(storageKey);
          if (savedContent) {
            sessionStorage.removeItem(storageKey);
          }
        });

        const statusMap = doc.getMap("status");
        const updateSaveStatusFromMap = () => {
          const lastSavedAtValue = statusMap.get("lastSavedAt");
          const hasUnsavedChangesValue = statusMap.get("hasUnsavedChanges");
          const checkpointInFlightValue = statusMap.get("checkpointInFlight");

          if (typeof lastSavedAtValue === "string") {
            setLastSavedAt(new Date(lastSavedAtValue));
          }

          if (hasUnsavedChangesValue === false) {
            setHasLocalEdits(false);
            setSaveState("saved");
          } else if (hasUnsavedChangesValue === true && hasLocalEditsRef.current) {
            setSaveState(checkpointInFlightValue ? "saving" : "pending");
          }
        };

        statusMapRef.current = statusMap;
        statusObserverRef.current = updateSaveStatusFromMap;
        updateSaveStatusFromMap();
        statusMap.observe(updateSaveStatusFromMap);

        const view = new EditorView({
          state: EditorState.create({
            doc: yText.toString(),
            extensions: [
              keymap.of(defaultKeymap),
              syntaxHighlighting(defaultHighlightStyle),
              lineNumbers(),
              highlightActiveLineGutter(),
              highlightActiveLine(),
              markdown(),
              EditorView.lineWrapping,
              yCollab(yText, provider.awareness),
              blameCompartmentRef.current.of(createBlameGutter()),
              EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                  setContent(update.state.doc.toString());
                  const isLocalEdit = update.transactions.some(
                    (transaction) =>
                      transaction.isUserEvent("input") || transaction.isUserEvent("delete")
                  );
                  if (isLocalEdit) {
                    setHasLocalEdits(true);
                    setSaveState("pending");
                  }
                }
              }),
            ],
          }),
          parent: editorHostRef.current,
        });

        editorViewRef.current = view;
        setReady(true);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to initialize editor";
        setError(message);
        setStatus("disconnected");
      }
    };

    setupEditor();

    const handleVisibilityChange = () => {
      if (document.hidden && editorViewRef.current && !isManualMode) {
        sessionStorage.setItem(storageKey, editorViewRef.current.state.doc.toString());
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        isActive = false;
        abortController.abort();
        if (statusMapRef.current && statusObserverRef.current) {
          statusMapRef.current.unobserve(statusObserverRef.current);
        }
        statusMapRef.current = null;
        statusObserverRef.current = null;
        awarenessCleanupRef.current?.();
        awarenessCleanupRef.current = null;
        providerRef.current?.destroy();
        docRef.current?.destroy();
        editorViewRef.current?.destroy();
        providerRef.current = null;
        docRef.current = null;
        editorViewRef.current = null;
        refreshPromiseRef.current = null;
      };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awarenessColor, initialContent, noteId, notePublicId, session?.user, sessionPending, storageKey, workspaceId, workspaceSlug]);

  const createBlameGutter = useCallback(() => {
    if (!showBlame) {
      return [];
    }

    const truncateLabel = (label: string) => {
      if (label.length <= 14) {
        return label;
      }
      return `${label.slice(0, 12)}…`;
    };

    return gutter({
      class: "cm-blame-gutter",
      lineMarker: (view, line) => {
        const lineNumber = view.state.doc.lineAt(line.from).number;
        const blame = blameByLine.get(lineNumber);
        const label = truncateLabel(formatAuthor(blame));
        const tooltip = blame?.touchedAt ? formatTimestamp(blame.touchedAt) : "";
        return new BlameMarker(label, tooltip);
      },
      lineMarkerChange: () => true,
    });
  }, [showBlame, blameByLine]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) {
      return;
    }

    view.dispatch({
      effects: blameCompartmentRef.current.reconfigure(createBlameGutter()),
    });
  }, [blameByLine, createBlameGutter, showBlame]);

  const formatTimestamp = (value: string | Date) => {
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString();
  };

  const handleManualSave = useCallback(async () => {
    if (!isManualMode || saveState === "saving" || !hasLocalEdits) {
      return;
    }

    setSaveState("saving");
    setError(null);

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/notes/${notePublicId}/content`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content, includeBlame: true }),
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message =
          typeof payload?.error === "string" ? payload.error : "Failed to save changes";
        throw new Error(message);
      }

      const data = await response.json() as {
        updatedAt: string;
        blame?: BlameEntry[];
      };

      setLastSavedAt(new Date(data.updatedAt));
      setSaveState("saved");
      setHasLocalEdits(false);
      if (data.blame) {
        setBlameEntries(data.blame);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Failed to save changes";
      setError(message);
      setSaveState("error");
    }
  }, [content, hasLocalEdits, isManualMode, notePublicId, saveState, workspaceSlug]);

  const saveStatusTone = useMemo(() => {
    if (isManualMode) {
      return saveState === "error" ? "text-destructive" : "text-muted-foreground";
    }
    if (status === "disconnected" || saveState === "error") {
      return "text-destructive";
    }
    return "text-muted-foreground";
  }, [isManualMode, saveState, status]);

  const saveStatusLabel = useMemo(() => {
    // Manual-save mode labels
    if (isManualMode) {
      if (saveState === "error") {
        return "Save failed";
      }
      if (saveState === "saving") {
        return "Saving...";
      }
      if (saveState === "pending") {
        return "Unsaved changes";
      }
      if (lastSavedAt) {
        return `All changes saved • ${formatTimestamp(lastSavedAt)}`;
      }
      return "All changes saved";
    }

    // Collab mode labels
    if (status === "disconnected") {
      return "Offline";
    }
    if (saveState === "error") {
      return "Autosave error";
    }
    if (saveState === "saving") {
      return "Saving...";
    }
    if (saveState === "pending") {
      return "Changes pending";
    }
    if (lastSavedAt) {
      return `All changes saved • ${formatTimestamp(lastSavedAt)}`;
    }
    return "All changes saved";
  }, [isManualMode, lastSavedAt, saveState, status]);

  return (
    <div className="note-editor flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{displayTitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => updateViewMode("code")}
                  className={cn(
                    "h-6 w-8",
                    viewMode === "code" && "bg-background shadow-sm"
                  )}
                >
                  <Code className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Code</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => updateViewMode("split")}
                  className={cn(
                    "h-6 w-8",
                    viewMode === "split" && "bg-background shadow-sm"
                  )}
                >
                  <SquareSplitHorizontal className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Split</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => updateViewMode("preview")}
                  className={cn(
                    "h-6 w-8",
                    viewMode === "preview" && "bg-background shadow-sm"
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Preview</TooltipContent>
            </Tooltip>
          </div>
          {/* Manual-save mode: Show Save button */}
          {isManualMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualSave}
              disabled={saveState === "saving" || !hasLocalEdits}
              className="h-6 px-2 text-[11px]"
            >
              {saveState === "saving" ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Saving...
                </>
              ) : saveState === "error" ? (
                "Save failed"
              ) : (
                "Save"
              )}
            </Button>
          )}
          {/* Collab mode: Show status icon */}
          {!isManualMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "h-6 w-8",
                    status === "connected" && "text-primary",
                    status === "connecting" && "text-muted-foreground",
                    status === "disconnected" && "text-destructive"
                  )}
                >
                  {statusIcon[status]}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{status}</TooltipContent>
            </Tooltip>
          )}
          <span className={`text-[11px] ${saveStatusTone}`}>{saveStatusLabel}</span>
          {/* Collab mode: Show active users */}
          {!isManualMode && activeUsers.length > 0 ? (
            <div className="flex items-center gap-1">
              {visibleUsers.map((user) => (
                <Tooltip key={user.id}>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-foreground">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: user.color }}
                      />
                      <span className="font-medium">{getInitials(user.name)}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{user.name}</TooltipContent>
                </Tooltip>
              ))}
              {overflowCount > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground cursor-help">
                      +{overflowCount}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{overflowLabel}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-6 w-8"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => router.push(`/workspaces/${workspaceSlug}/notes/${notePublicId}/history`)}
              >
                <History className="mr-2 h-4 w-4" />
                History
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowBlame((prev) => !prev)}>
                <GitCommit className="mr-2 h-4 w-4" />
                {showBlame ? "Hide blame" : "Show blame"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {error ? (
          <div className="px-3 pb-2">
            <Alert variant="destructive">
              <AlertTitle>{isManualMode ? "Save error" : "Collaboration error"}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        <div
          className={
            viewMode === "split"
              ? "grid h-full min-h-0 flex-1 grid-cols-2 gap-0"
              : "flex h-full min-h-0 flex-1 flex-col"
          }
        >
          <div
            className={`relative min-h-0 overflow-hidden ${
              viewMode === "preview" ? "hidden" : viewMode === "split" ? "border-r" : ""
            } border-border`}
          >
            {!ready ? (
              <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
            ) : null}
            <div ref={editorHostRef} className="editor-surface h-full w-full" />
          </div>
          {viewMode !== "code" ? (
            <div
              ref={previewPaneRef}
              className="preview-pane h-full min-h-0 overflow-auto bg-background p-4 text-sm"
            >
              <div
                className="preview-content"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
