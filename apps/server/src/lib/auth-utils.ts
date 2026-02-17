/**
 * Get the base URL for authentication endpoints.
 * Uses betterAuthUrl from config if set, otherwise constructs from server host/port.
 */
export function getAuthBaseUrl(): string {
  const config = global.KONTEXTED_CONFIG;

  if (config.auth.betterAuthUrl) {
    return config.auth.betterAuthUrl;
  }

  const rawHost = config.server.host;
  const host = rawHost === "0.0.0.0" || rawHost === "::" ? "localhost" : rawHost;
  const port = config.server.port;

  return `http://${host}:${port}`;
}
