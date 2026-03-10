import type { OAuthState } from "@/types";
import { logDebug, logError } from "@/lib/logger";

/**
 * API client for making authenticated HTTP requests with automatic token refresh
 */
export class ApiClient {
  constructor(
    private serverUrl: string,
    private oauth: OAuthState,
    private persist: () => Promise<void>
  ) {}

  /**
   * Get the base URL for API requests
   */
  get baseUrl(): string {
    return this.serverUrl;
  }

  /**
   * Get the current access token
   */
  getAccessToken(): string {
    return this.oauth.tokens?.access_token ?? "";
  }

  /**
   * Get the current OAuth state
   * Useful for external callers to get the latest tokens after refresh
   */
  getOAuth(): OAuthState {
    return this.oauth;
  }

  /**
   * Make an authenticated HTTP request
   * Automatically handles token refresh on 401 responses
   */
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = new URL(path, this.serverUrl);

    // Prepare headers with Authorization
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${this.oauth.tokens?.access_token}`,
    } as Record<string, string>;

    // Set Content-Type to application/json by default for methods that have a body
    if (options.body !== undefined && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const requestOptions: RequestInit = {
      ...options,
      headers,
    };

    logDebug(`[API CLIENT] ${options.method ?? "GET"} ${path}`);
    let response = await fetch(url.toString(), requestOptions);
    logDebug(`[API CLIENT] Response status: ${response.status}`);

    // Handle 401 Unauthorized - attempt to refresh token
    if (response.status === 401 && this.oauth.tokens?.refresh_token) {
      logDebug("[API CLIENT] Token expired, attempting to refresh...");
      const refreshed = await this.refreshToken();

      if (refreshed) {
        logDebug("[API CLIENT] Token refreshed successfully, retrying request...");
        // Update Authorization header with new token
        headers.Authorization = `Bearer ${this.oauth.tokens?.access_token}`;
        requestOptions.headers = headers;

        logDebug(`[API CLIENT] New access token: ${this.oauth.tokens?.access_token?.substring(0, 20)}...`);

        // Retry the original request with new token
        try {
          response = await fetch(url.toString(), requestOptions);
          logDebug(`[API CLIENT] Retry response status: ${response.status}`);
        } catch (fetchError) {
          logError("[API CLIENT] Retry fetch failed:", fetchError);
          throw fetchError;
        }
      } else {
        throw new Error(
          "Failed to refresh access token. Please run 'kontexted login' to re-authenticate."
        );
      }
    }

    // If still 401 after refresh attempt (or no refresh token available)
    if (response.status === 401) {
      throw new Error(
        "Authentication failed. Please run 'kontexted login' to re-authenticate."
      );
    }

    return response;
  }

  /**
   * Refresh the access token using the refresh token
   * @returns true if refresh was successful, false otherwise
   */
  async refreshToken(): Promise<boolean> {
    if (!this.oauth.tokens?.refresh_token) {
      logError("[API CLIENT] No refresh token available");
      return false;
    }

    try {
      const tokenUrl = new URL("/api/auth/oauth2/token", new URL(this.serverUrl).origin);

      logDebug(`[API CLIENT] Refreshing token - URL: ${tokenUrl.toString()}`);

      const response = await fetch(tokenUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: this.oauth.tokens.refresh_token,
          client_id: this.oauth.clientInformation?.client_id ?? "",
          client_secret: this.oauth.clientInformation?.client_secret ?? "",
        }),
      });

      logDebug(`[API CLIENT] Token refresh response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        logError(`[API CLIENT] Failed to refresh access token - Status: ${response.status}, Error: ${errorText}`);
        return false;
      }

const tokens = (await response.json()) as typeof this.oauth.tokens;

// Calculate absolute expiry time if not provided by server
if (tokens.expires_in && !tokens.expires_at) {
  tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
}

this.oauth.tokens = tokens;
await this.persist();

logDebug("[API CLIENT] Token refresh successful");
return true;
    } catch (error) {
      logError("[API CLIENT] Error refreshing access token:", error);
      return false;
    }
  }

  /**
   * Make a GET request
   */
  async get(path: string): Promise<Response> {
    return this.request(path, { method: "GET" });
  }

  /**
   * Make a POST request with a JSON body
   */
  async post(path: string, body: unknown): Promise<Response> {
    return this.request(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Make a PUT request with a JSON body
   */
  async put(path: string, body: unknown): Promise<Response> {
    return this.request(path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  /**
   * Make a DELETE request
   */
  async delete(path: string): Promise<Response> {
    return this.request(path, { method: "DELETE" });
  }
}
