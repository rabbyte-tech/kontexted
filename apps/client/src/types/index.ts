/**
 * Shared API types for Kontexted
 * Used by both client and server for type safety
 */

/**
 * Connection mode types
 */
export type ConnectionMode = 'local' | 'remote';

/**
 * Connection status types
 */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

/**
 * API client configuration
 */
export interface ApiClientConfig {
  baseUrl: string;
  timeout?: number;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
}

/**
 * Session information from better-auth
 */
export interface Session {
  user: {
    id: string;
    email: string;
    name?: string;
    image?: string;
  };
  token: string;
  expiresAt: Date;
}

/**
 * Workspace types
 */
export interface Workspace {
  id: number;
  slug: string;
  name: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkspaceRequest {
  name: string;
}

export interface UpdateWorkspaceRequest {
  name: string;
}

/**
 * Note types
 */
export interface Note {
  id: number;
  publicId: string;
  name: string;
  title: string;
  content: string;
  workspaceId: number;
  folderId: number | null;
  createdAt: Date;
  updatedAt: Date;
  blame?: BlameEntry[];
}

export interface CreateNoteRequest {
  title: string;
  name: string;
  content?: string;
  folderId?: string;
}

export interface UpdateNoteRequest {
  title?: string;
  content?: string;
}

/**
 * Folder types
 */
export interface Folder {
  id: number;
  publicId: string;
  name: string;
  displayName: string;
  workspaceId: number;
  parentId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFolderRequest {
  name: string;
  displayName: string;
  parentFolderPublicId?: string;
}

export interface MoveFolderRequest {
  newParentPublicId?: string;
}

/**
 * Workspace tree with folders and notes
 */
export interface WorkspaceTree {
  workspaceSlug: string;
  workspaceName: string;
  workspaceId?: number;
  rootNotes: NoteSummary[];
  folders: FolderNode[];
}

export interface NoteSummary {
  publicId: string;
  name: string;
  title: string;
  id?: number;
  folderId?: number | null;
  folderPublicId: string | null;
}

export interface FolderNode {
  publicId: string;
  name: string;
  displayName: string;
  id?: number;
  parentPublicId: string | null;
  notes: NoteSummary[];
  children: FolderNode[];
}

/**
 * Auth request/response types
 */
export interface SignUpRequest {
  email: string;
  password: string;
  name?: string;
  inviteCode?: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name?: string;
    image?: string;
  };
  session: {
    token: string;
    expiresAt: string;
  };
}

export interface SignOutResponse {
  success: boolean;
}

/**
 * Workspace event types for SSE
 */
export interface WorkspaceEvent {
  type: 'workspace.created' | 'workspace.updated' | 'workspace.deleted' |
         'note.created' | 'note.updated' | 'note.deleted' |
         'folder.created' | 'folder.updated' | 'folder.deleted' |
         'note.moved' | 'folder.moved';
  workspaceId?: number;
  data: unknown;
  timestamp: string;
}

/**
 * Collab service types
 */
export interface CollabToken {
  token: string;
  expiresAt: number;
}

/**
 * Collab service configuration
 */
export interface CollabConfig {
  enabled: boolean;
  url: string | null;
  healthy?: boolean; // Optional health status (can be added in Phase 3)
}

/**
 * Server capabilities response
 */
export interface ServerCapabilities {
  authMethod: 'email-password' | 'keycloak';
  inviteCodeAvailable: boolean;
}

export interface BlameEntry {
  lineNumber: number;
  authorUserId: string;
  authorName: string | null;
  authorEmail: string | null;
  revisionId: number;
  touchedAt: string;
}

export interface UpdateNoteContentResponse {
  updatedAt: string;
  revisionId: number;
  blame?: BlameEntry[];
}

export interface CollabStatus {
  connected: boolean;
  activeUsers: number;
}

/**
 * MCP types
 */
export interface McpToolInput {
  [key: string]: unknown;
}

export interface McpToolOutput {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
  structuredContent?: unknown;
}

/**
 * Error types
 */
export interface ApiError {
  error: string;
  status: number;
  details?: Record<string, unknown>;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  database?: {
    connected: boolean;
    dialect: string;
  };
}

/**
 * Pagination types
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Search types
 */
export interface SearchParams {
  query: string;
  limit?: number;
}

export interface SearchResult {
  type: 'note' | 'folder' | 'workspace';
  id: string;
  title: string;
  snippet?: string;
}

/**
 * File upload types
 */
export interface FileUploadRequest {
  file: File;
  folderId?: string;
}

export interface FileUploadResponse {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
}

/**
 * Settings types
 */
export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  editorFontSize: number;
  editorFontFamily: string;
  autoSave: boolean;
  autoSaveInterval: number; // in seconds
}

export interface UpdateUserSettingsRequest {
  theme?: 'light' | 'dark' | 'system';
  editorFontSize?: number;
  editorFontFamily?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
}

/**
 * Workspace upload types
 */
export interface UploadEntry {
  name: string
  title: string
  content: string
  folderPath: string | null
}

export interface UploadWorkspaceEntriesRequest {
  entries: Array<{
    name: string
    title: string
    content: string
    folderPath: string | null
  }>
  targetFolderPublicId: string | null
}

export interface UploadWorkspaceEntriesResponse {
  created: number
  errors: Array<{
    path: string
    error: string
  }>
}

/**
 * Note revision history types
 */
export interface NoteRevision {
  id: number;
  authorUserId: string;
  createdAt: string;
  authorName: string | null;
  authorEmail: string | null;
  content: string;
}

export interface NoteHistoryResponse {
  revisions: NoteRevision[];
}
