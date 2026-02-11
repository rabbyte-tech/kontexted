/**
 * Type definitions for Kontexted CLI
 */

/** OAuth token data */
export interface OAuthTokens {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number; // Unix timestamp (seconds) when token expires
  scope?: string;
  id_token?: string;
}

/** OAuth client information - matches SDK's OAuthClientInformationMixed */
export interface OAuthClientInfo {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
  redirect_uris?: URL[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  client_name?: string;
  client_uri?: URL;
  logo_uri?: string;
  scope?: string;
  contacts?: string[];
  tos_uri?: string;
  policy_uri?: string;
  jwks_uri?: URL;
  jwks?: unknown;
  software_id?: string;
  software_version?: string;
  software_statement?: string;
}

/** OAuth state stored in profile */
export interface OAuthState {
  clientInformation?: OAuthClientInfo;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  redirectUrl?: string;
  clientMetadata?: Record<string, unknown>;
  serverUrl?: string;
}

/** Stored profile configuration */
export interface Profile {
  serverUrl: string;
  workspace: string;
  write: boolean;
  oauth: OAuthState;
}

/** Configuration file structure */
export interface Config {
  profiles: Record<string, Profile>;
}

/** MCP Tool from server */
export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** MCP Tool list response */
export interface McpToolList {
  tools: McpTool[];
}
