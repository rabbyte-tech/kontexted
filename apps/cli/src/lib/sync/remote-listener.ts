import type { ApiClient } from "@/lib/api-client";
import type { RemoteNote, RemoteFolder, RemoteChangeEvent, RemoteFolderChangeEvent } from "./types";

/**
 * RemoteListener subscribes to workspace events via SSE (Server-Sent Events)
 * and emits change events when notes are created, updated, or deleted.
 */
export class RemoteListener {
  private abortController: AbortController | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isRunning = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private onStopped?: () => void;

  constructor(
    private apiClient: ApiClient,
    private workspaceSlug: string,
    private onChange: (event: RemoteChangeEvent) => void,
    private onFolderChange?: (event: RemoteFolderChangeEvent) => void
  ) {}

  /**
   * Set callback for when listener stops (e.g., due to max reconnects)
   */
  setOnStopped(callback: () => void): void {
    this.onStopped = callback;
  }

  /**
   * Start listening for remote changes via SSE using fetch
   */
  async start(): Promise<void> {
    this.isRunning = true;
    await this.connect();
  }

  /**
   * Connect to SSE endpoint using fetch
   */
  private async connect(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const url = `${this.apiClient.baseUrl}/api/sync/events?workspaceSlug=${encodeURIComponent(this.workspaceSlug)}`;
    this.abortController = new AbortController();

    // Get fresh token before connecting
    let accessToken = this.apiClient.getAccessToken();
    
    if (!accessToken) {
      console.error("[RemoteListener] No access token available");
      this.handleReconnect();
      return;
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "text/event-stream",
          "Authorization": `Bearer ${accessToken}`,
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.warn("[RemoteListener] Token expired, attempting to refresh...");
          
          // Attempt to refresh the token via ApiClient
          const refreshed = await this.apiClient.refreshToken();
          
          if (refreshed) {
            // Retry the connection with the new token
            const newToken = this.apiClient.getAccessToken();
            if (newToken) {
              console.log("[RemoteListener] Token refreshed, retrying connection...");
              const retryResponse = await fetch(url, {
                method: "GET",
                headers: {
                  "Accept": "text/event-stream",
                  "Authorization": `Bearer ${newToken}`,
                },
                signal: this.abortController.signal,
              });
              
              if (retryResponse.ok) {
                // Success on retry - handle SSE connection
                await this.handleSSEConnection(retryResponse);
                return;
              }
            }
          }
          
          console.error("[RemoteListener] Authentication failed after refresh attempt.");
        }
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      await this.handleSSEConnection(response);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Normal abort, don't reconnect
        return;
      }
      console.error("[RemoteListener] Connection error:", error);
      this.handleReconnect();
    }
  }

  /**
   * Handle SSE connection after successful response
   */
  private async handleSSEConnection(response: Response): Promise<void> {
    if (!response.body) {
      throw new Error("No response body");
    }

    // Reset reconnect attempts on successful connection
    this.reconnectAttempts = 0;
    console.log("[RemoteListener] Connected to SSE");

    // Process the stream
    await this.processStream(response.body);
  }

  /**
   * Process the SSE stream
   */
  private async processStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (this.isRunning) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete events (separated by double newlines)
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? ""; // Keep incomplete event in buffer

        for (const line of lines) {
          this.parseEvent(line);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("[RemoteListener] Stream error:", error);
      this.handleReconnect();
    }
  }

  /**
   * Parse an SSE event
   */
  private parseEvent(eventText: string): void {
    if (!eventText.trim()) {
      return;
    }

    // Skip comments (heartbeats)
    if (eventText.startsWith(":")) {
      return;
    }

    let eventType = "message";
    let eventData = "";

    // Parse event lines
    for (const line of eventText.split("\n")) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        eventData = line.slice(5).trim();
      }
    }

    if (!eventData) {
      return;
    }

    try {
      const data = JSON.parse(eventData);
      this.handleChange({ type: eventType, data });
    } catch (error) {
      console.error("[RemoteListener] Failed to parse event data:", error);
    }
  }

  /**
   * Handle incoming change events from SSE
   */
  private handleChange(data: { type: string; data: unknown }): void {
    switch (data.type) {
      case "note.created":
        this.onChange({
          type: "create",
          note: data.data as RemoteNote,
        });
        break;
      case "note.updated":
        this.onChange({
          type: "update",
          note: data.data as RemoteNote,
        });
        break;
      case "note.deleted":
        this.onChange({
          type: "delete",
          publicId: (data.data as { publicId: string }).publicId,
        });
        break;
      // Handle folder events
      case "folder.created":
        if (this.onFolderChange) {
          this.onFolderChange({ type: "folder.create", folder: data.data as RemoteFolder });
        }
        break;
      case "folder.deleted":
        if (this.onFolderChange) {
          this.onFolderChange({ type: "folder.delete", publicId: (data.data as { publicId: string }).publicId });
        }
        break;
      case "folder.updated":
        if (this.onFolderChange) {
          this.onFolderChange({ type: "folder.update", folder: data.data as RemoteFolder });
        }
        break;
      case "ready":
        // Connection established event
        console.log("[RemoteListener] SSE ready");
        break;
      default:
        console.log(`[RemoteListener] Unknown event type: ${data.type}`);
    }
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnect(): void {
    if (!this.isRunning) {
      return;
    }

    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error("[RemoteListener] Max reconnect attempts reached");
      this.stop();
      // Notify callback that listener stopped permanently
      if (this.onStopped) {
        this.onStopped();
      }
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(
      `[RemoteListener] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      if (this.isRunning) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Stop listening for remote changes
   */
  stop(): void {
    this.isRunning = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.reconnectAttempts = 0;
  }
}
