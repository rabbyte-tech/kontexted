import { createRemoteJWKSet, jwtVerify } from "jose";

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

// Create JWKS function
let jwksFunction: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwksFunction() {
  if (!jwksFunction) {
    const authBaseUrl = getAuthBaseUrl();
    const jwksUrl = `${authBaseUrl}/api/auth/jwks`;
    jwksFunction = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwksFunction;
}

/**
 * Verify JWT Bearer token from Authorization header
 * @param request - The Request object to extract and verify token from
 * @returns The JWT payload if valid, null otherwise
 */
export async function verifyBearerToken(request: Request): Promise<Record<string, unknown> | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  const authBaseUrl = getAuthBaseUrl();

  const verifyOptions = {
    issuer: `${authBaseUrl}/api/auth`,
    audience: [authBaseUrl, `${authBaseUrl}/`, `${authBaseUrl}/mcp`],
  };

  try {
    const jwks = getJwksFunction();
    const { payload } = await jwtVerify(token, jwks, verifyOptions);
    return payload;
  } catch (error) {
    return null;
  }
}
