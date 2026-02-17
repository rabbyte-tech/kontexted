import type { Context } from 'hono';
import type { Variables } from '@/routes/types';

/**
 * OAuth Protected Resource Discovery endpoint
 * Returns metadata for the protected resource according to RFC 8707
 */
export async function GET(c: Context<{ Variables: Variables }>) {
  // Get server base URL from config
  const config = global.KONTEXTED_CONFIG || {
    server: {
      host: 'localhost',
      port: 4242,
    },
    auth: {
      betterAuthUrl: undefined,
    },
  };

  const configHost =
    config.server.host === '0.0.0.0' || config.server.host === '::'
      ? 'localhost'
      : config.server.host;

  const protocol = config.auth?.betterAuthUrl?.startsWith('https') ? 'https' : 'http';
  const baseURL = `${protocol}://${configHost}:${config.server.port}`;

  // Get the resource path from the request URL (if it includes trailing path segments)
  const resourcePath = c.req.path.replace('/.well-known/oauth-protected-resource', '') || '';

  const resource = resourcePath ? `${baseURL}${resourcePath}` : baseURL;

  // Return protected resource metadata
  return c.json({
    resource,
    authorization_servers: [`${baseURL}/api/auth`],
    scopes_supported: ['openid', 'profile', 'email'],
    bearer_methods_supported: ['header'],
  });
}
