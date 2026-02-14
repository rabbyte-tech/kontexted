/**
 * Get the base URL for authentication endpoints.
 * Uses BETTER_AUTH_URL environment variable if set, otherwise constructs from HOST/PORT.
 */
export function getAuthBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }

  const rawHost = process.env.HOST || "localhost";
  const host = rawHost === "0.0.0.0" || rawHost === "::" ? "localhost" : rawHost;
  const port = process.env.PORT || "4242";

  return `http://${host}:${port}`;
}
