/**
 * API client for Kontexted
 * Handles all API communication with the server
 */

import type {
  ApiResponse,
  Session,
  Workspace,
  Note,
  WorkspaceTree,
  SignUpRequest,
  SignInRequest,
  AuthResponse,
  UploadWorkspaceEntriesRequest,
  UploadWorkspaceEntriesResponse,
  Folder,
  CollabToken,
  UpdateNoteContentResponse,
  NoteHistoryResponse,
  ServerCapabilities,
} from "@/types";

/**
 * API Client Class
 * Handles all API communication with the server
 */
export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor() {
    this.baseUrl = this.getBaseUrl();
    this.token = localStorage.getItem("authToken");
  }

  /**
   * Get the base URL
   */
  getBaseUrl(): string {
    return ""; // Use relative URLs since client and server are same-origin
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    this.token = token;
    localStorage.setItem("authToken", token);
  }

  /**
   * Clear authentication token
   */
  clearToken(): void {
    this.token = null;
    localStorage.removeItem("authToken");
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    }

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: options.credentials ?? "include",
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        return {
          error: data?.error || `Request failed: ${response.statusText}`,
          status: response.status,
        }
      }

      return {
        data,
        status: response.status,
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Network error",
        status: 0,
      }
    }
  }

  // Auth API

  /**
   * Sign up a new user
   */
  async signUp(data: SignUpRequest): Promise<ApiResponse<AuthResponse>> {
    const response = await this.request<AuthResponse>("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (response.data?.session?.token) {
      this.setToken(response.data.session.token);
    }

    return response;
  }

  /**
   * Sign in an existing user
   */
  async signIn(data: SignInRequest): Promise<ApiResponse<AuthResponse>> {
    const response = await this.request<AuthResponse>("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (response.data?.session?.token) {
      this.setToken(response.data.session.token);
    }

    return response;
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<ApiResponse<void>> {
    const response = await this.request<void>("/api/auth/sign-out", {
      method: "POST",
      body: JSON.stringify({}), // Add empty JSON object
    });

    this.clearToken();
    return response;
  }

  /**
   * Get current session
   */
  async getSession(): Promise<ApiResponse<Session>> {
    return this.request<Session>("/api/auth/get-session");
  }

  // Workspace API

  /**
   * List all workspaces
   */
  async listWorkspaces(): Promise<ApiResponse<Workspace[]>> {
    return this.request<Workspace[]>("/api/workspaces");
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(name: string): Promise<ApiResponse<Workspace>> {
    return this.request<Workspace>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  /**
   * Get a workspace by slug
   */
  async getWorkspace(slug: string): Promise<ApiResponse<Workspace>> {
    return this.request<Workspace>(`/api/workspaces/${slug}`);
  }

  /**
   * Update a workspace
   */
  async updateWorkspace(slug: string, name: string): Promise<ApiResponse<Workspace>> {
    return this.request<Workspace>(`/api/workspaces/${slug}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  }

  /**
   * Delete a workspace
   */
  async deleteWorkspace(slug: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/workspaces/${slug}`, {
      method: "DELETE",
    });
  }

  // Notes API

  /**
   * List notes in a workspace
   */
  async listNotes(workspaceSlug: string): Promise<ApiResponse<Note[]>> {
    return this.request<Note[]>(`/api/workspaces/${workspaceSlug}/notes`);
  }

  /**
   * Create a new note
   */
  async createNote(
    workspaceSlug: string,
    title: string,
    name: string,
    folderId?: string | null
  ): Promise<ApiResponse<Note>> {
    return this.request<Note>(`/api/workspaces/${workspaceSlug}/notes`, {
      method: "POST",
      body: JSON.stringify({ title, name, folderId }),
    });
  }

  /**
   * Get a note by ID
   */
  async getNote(workspaceSlug: string, notePublicId: string): Promise<ApiResponse<Note>> {
    return this.request<Note>(`/api/workspaces/${workspaceSlug}/notes/${notePublicId}`);
  }

  /**
   * Update a note
   */
  async updateNote(
    workspaceSlug: string,
    notePublicId: string,
    title?: string,
    name?: string
  ): Promise<ApiResponse<Note>> {
    return this.request<Note>(`/api/workspaces/${workspaceSlug}/notes/${notePublicId}`, {
      method: "PATCH",
      body: JSON.stringify({ title, name }),
    });
  }

  /**
   * Delete a note
   */
  async deleteNote(workspaceSlug: string, notePublicId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/workspaces/${workspaceSlug}/notes/${notePublicId}`, {
      method: "DELETE",
    });
  }

  /**
   * Get note revision history
   */
  async getNoteHistory(
    workspaceSlug: string,
    notePublicId: string,
    limit?: number
  ): Promise<ApiResponse<NoteHistoryResponse>> {
    const query = limit ? `?limit=${limit}` : "";
    return this.request<NoteHistoryResponse>(
      `/api/workspaces/${workspaceSlug}/notes/${notePublicId}/history${query}`
    );
  }

  // Workspace Tree API

  /**
   * Get workspace tree
   */
  async getWorkspaceTree(workspaceSlug: string): Promise<ApiResponse<WorkspaceTree>> {
    return this.request<WorkspaceTree>(`/api/workspaces/${workspaceSlug}/tree`);
  }

  /**
   * Upload markdown entries to a workspace
   */
  async uploadWorkspaceEntries(
    workspaceSlug: string,
    data: UploadWorkspaceEntriesRequest
  ): Promise<ApiResponse<UploadWorkspaceEntriesResponse>> {
    return this.request<UploadWorkspaceEntriesResponse>(`/api/workspaces/${workspaceSlug}/upload`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Create a new folder
   */
  async createFolder(
    workspaceSlug: string,
    displayName: string,
    name: string,
    parentId?: string
  ): Promise<ApiResponse<Folder>> {
    return this.request<Folder>(`/api/workspaces/${workspaceSlug}/folders`, {
      method: "POST",
      body: JSON.stringify({ displayName, name, parentId }),
    });
  }

  /**
   * Update a folder
   */
  async updateFolder(
    workspaceSlug: string,
    folderPublicId: string,
    displayName?: string,
    name?: string
  ): Promise<ApiResponse<Folder>> {
    return this.request<Folder>(`/api/workspaces/${workspaceSlug}/folders/${folderPublicId}`, {
      method: "PATCH",
      body: JSON.stringify({ displayName, name }),
    });
  }

  /**
   * Delete a folder
   */
  async deleteFolder(workspaceSlug: string, folderPublicId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/workspaces/${workspaceSlug}/folders/${folderPublicId}`, {
      method: "DELETE",
    });
  }

  /**
   * Move a folder to a new parent
   */
  async moveFolder(
    workspaceSlug: string,
    folderPublicId: string,
    parentId: string | null
  ): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/workspaces/${workspaceSlug}/folders/${folderPublicId}/move`, {
      method: "PATCH",
      body: JSON.stringify({ parentId }),
    });
  }

  /**
   * Move a note to a new folder
   */
  async moveNote(
    workspaceSlug: string,
    notePublicId: string,
    folderId: string | null
  ): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/workspaces/${workspaceSlug}/notes/${notePublicId}/move`, {
      method: "PATCH",
      body: JSON.stringify({ folderId }),
    });
  }

  // Collab API

  /**
   * Get collaboration token for a note
   */
  async getCollabToken(
    workspaceSlug: string,
    notePublicId: string
  ): Promise<ApiResponse<CollabToken>> {
    return this.request<CollabToken>("/api/collab/token", {
      method: "POST",
      body: JSON.stringify({ workspaceSlug, noteId: notePublicId }),
    })
  }

  /**
   * Update note content (manual save mode)
   */
  async updateNoteContent(
    workspaceSlug: string,
    notePublicId: string,
    content: string,
    includeBlame?: boolean
  ): Promise<ApiResponse<UpdateNoteContentResponse>> {
    return this.request<UpdateNoteContentResponse>(
      `/api/workspaces/${workspaceSlug}/notes/${notePublicId}/content`,
      {
        method: "PATCH",
        body: JSON.stringify({ content, includeBlame }),
      }
    )
  }

  // SSE (Server-Sent Events) for real-time updates

  /**
   * Subscribe to workspace events
   *
   * Subscribes to all named SSE events emitted by the server.
   * The server emits events with named types (e.g., "note.updated", "folder.created")
   * which are handled here and passed to the callback as MessageEvent objects.
   *
   * The callback receives MessageEvent objects where event.type contains the event name
   * (e.g., "note.updated", "folder.created", etc.).
   *
   * @returns An object with the EventSource and a cleanup function to remove listeners
   */
  subscribeToWorkspaceEvents(
    workspaceSlug: string,
    onEvent: (event: MessageEvent) => void
  ): { eventSource: EventSource; cleanup: () => void } {
    const eventSource = new EventSource(
      `/api/workspaces/${workspaceSlug}/events`,
      {
        withCredentials: true,
      }
    );

    // Register listeners for all known named event types
    // The server sends SSE events with names like "note.updated", "folder.created", etc.
    const eventTypes = [
      "note.created",
      "note.updated",
      "note.deleted",
      "note.moved",
      "folder.created",
      "folder.updated",
      "folder.deleted",
      "folder.moved",
      "ready",
    ] as const;

    // Error handler to log connection issues (EventSource will auto-reconnect)
    const errorHandler = () => {
      console.debug("SSE connection error, EventSource will auto-reconnect");
    };

    eventTypes.forEach((eventType) => {
      eventSource.addEventListener(eventType, onEvent);
    });

    eventSource.addEventListener("error", errorHandler);

    // Provide a cleanup function to remove listeners before closing
    const cleanup = () => {
      eventTypes.forEach((eventType) => {
        eventSource.removeEventListener(eventType, onEvent);
      });
      eventSource.removeEventListener("error", errorHandler);
      eventSource.close();
    };

    return { eventSource, cleanup };
  }

  /**
   * Get MCP server info
   */
  getMcpUrl(): string {
    return "/mcp";
  }

  /**
   * Get server capabilities
   */
  async getServerCapabilities(): Promise<ApiResponse<ServerCapabilities>> {
    return this.request<ServerCapabilities>("/api/config");
  }
}

// Singleton instance
let apiClientInstance: ApiClient | null = null;

/**
 * Get the singleton API client instance
 */
export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new ApiClient();
  }
  return apiClientInstance;
}

// Export a default instance for convenience
export const apiClient = getApiClient();
