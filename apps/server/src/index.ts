import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { cors } from 'hono/cors';
import { upgradeWebSocket, websocket } from 'hono/bun';
import type { ServerWebSocket } from 'bun';
import { auth } from '@/auth';
import { db } from '@/db';
import { resolveConfig, getConfigSource } from '@/config-resolver';

import { getToken, verifyToken } from '@/collab-ws/auth';
import {
  checkNeedsReseed,
  ensureRoomState,
  getRoomStatus,
  manualSaveRoom,
  markRoomActivity,
  reseedDocumentFromDb,
  seedDocumentIfEmpty,
  clearRoomState,
} from '@/collab-ws/checkpoints';
import { resolveRoomName } from '@/collab-ws/rooms';
import { createNodeWebSocketAdapter, type NodeWebSocketAdapter } from '@/collab-ws/ws-adapter';
import { getRoom, removeRoom, setupWSConnection } from '@/collab-ws/y-websocket-server';

import { workspacesApp as workspacesRoutes } from '@/routes/workspaces';
import { collabApp as collabRoutes } from '@/routes/collab';
import { configApp as configRoutes } from '@/routes/config';
import createMcpHandler from '@/mcp';
import { setupStatic } from '@/static';

// Resolve configuration
const config = resolveConfig();

// Set global config for other modules to access
// This allows database.ts, auth.ts, etc. to use the same config
declare global {
  var KONTEXTED_CONFIG: typeof config;
}
global.KONTEXTED_CONFIG = config;

// Import Variables type for typing the Hono app
import type { Variables } from '@/routes/types';

// Create Hono app with typed context
const app = new Hono<{ Variables: Variables }>();

// Middleware
app.use(logger());
app.use(prettyJSON());
app.use(cors({
  origin: (origin) => {
    // Parse BETTER_AUTH_TRUSTED_ORIGINS if available
    const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
      ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map(o => o.trim())
      : [];
    
    // Check if origin is in trusted origins
    if (origin && trustedOrigins.includes(origin)) {
      return origin;
    }
    
    // Allow localhost for development
    if (origin?.startsWith('http://localhost') || origin?.startsWith('http://127.0.0.1')) {
      return origin;
    }
    
    // Allow same-origin requests (origin is undefined for same-origin)
    if (!origin) {
      return '*';
    }
    
    console.warn(`[CORS] Origin not allowed: ${origin}`);
    return null;
  },
  credentials: true,
}));

// Inject db into context
app.use(async (c, next) => {
  c.set('db', db);
  await next();
});

// Auth routes
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// OAuth discovery endpoints for MCP
app.get('/.well-known/oauth-authorization-server', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/auth/authorize`,
    token_endpoint: `${baseUrl}/api/auth/token`,
    registration_endpoint: `${baseUrl}/api/auth/register`,
    scopes_supported: ['openid', 'profile', 'email'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
  });
});

app.get('/.well-known/openid-configuration', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/auth/authorize`,
    token_endpoint: `${baseUrl}/api/auth/token`,
    userinfo_endpoint: `${baseUrl}/api/auth/userinfo`,
    jwks_uri: `${baseUrl}/api/auth/jwks`,
    scopes_supported: ['openid', 'profile', 'email'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
  });
});

// API routes
app.route('/api/workspaces', workspacesRoutes);
app.route('/api/collab', collabRoutes);
app.route('/api/config', configRoutes);
const mcpHandler = createMcpHandler();
app.all('/api/mcp/*', async (c) => mcpHandler(c.req.raw));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// WebSocket handler for real-time collaboration

const wsHandler = upgradeWebSocket(async (c) => {
  const req = c.req.raw;
  let roomName: string | null = null;
  let adapter: NodeWebSocketAdapter | null = null;
  let userId: string | null = null;

  return {
    async onOpen(event, ws) {
      const token = getToken(req);
      if (!token) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      try {
        const payload = await verifyToken(token);
        if (!payload.userId) {
          ws.close(1008, 'Unauthorized');
          return;
        }
        userId = payload.userId;
        roomName = resolveRoomName(payload);

        console.log(`[collab] New connection to ${roomName}, userId: ${userId}`);

        // In Hono's upgradeWebSocket for Bun, the ws parameter wraps the Bun WebSocket
        // We need to type cast it to access the underlying WebSocket
        const bunWs = ws as unknown as WebSocket;
        adapter = createNodeWebSocketAdapter(bunWs);

        setupWSConnection(adapter, req, { docName: roomName });

        const room = getRoom(roomName);

        const isFirstConnection = room.conns.size === 1;

        if (isFirstConnection) {
          await ensureRoomState(
            roomName!,
            Number(payload.workspaceId),
            Number(payload.noteId),
            String(payload.workspaceId),
            String(payload.notePublicId)
          );
          await seedDocumentIfEmpty(
            roomName!,
            Number(payload.workspaceId),
            Number(payload.noteId)
          );
        } else {
          const needsReseed = await checkNeedsReseed(roomName!);
          if (needsReseed) {
            await reseedDocumentFromDb(roomName!);
          }
        }

        room.userId = userId;

        const yText = room.getText('content');

        yText.observe(() => {
          const content = room.getText('content').toString();
          if (room.userId) {
            void markRoomActivity(roomName!, room.userId).catch((error) => {
              console.warn('Failed to mark activity', error);
            });
          }
        });

        console.log(`[collab] Connection ready for ${roomName}, userId: ${userId}`);
      } catch (error) {
        console.warn('Websocket auth failed', error);
        ws.close(1008, 'Unauthorized');
      }
    },
    onMessage(event, ws) {
      if (!adapter) {
        return;
      }
      adapter.emit('message', event.data);
    },
    onClose(event, ws) {
      const room = roomName ? getRoom(roomName!) : null;
      console.log(`[collab] Connection closed from ${roomName}, conns remaining: ${room?.conns.size || 0}`);
      if (adapter) {
        adapter.emit('close');
      }

      if (!roomName || !room) {
        return;
      }

      // Delay cleanup to allow reconnects
      setTimeout(() => {
        const currentRoom = getRoom(roomName!);
        if (!currentRoom || currentRoom.conns.size === 0) {
          console.log(`[collab] Cleaning up inactive room: ${roomName}`);
          clearRoomState(roomName!);
          removeRoom(roomName!);
        }
      }, 10000);
    },
    onError(event, ws) {
      console.warn(`[collab] WebSocket error for ${roomName}:`, event);
    },
  };
});

app.get('/ws', wsHandler);
app.get('/ws/*', wsHandler);

// Setup static file serving
setupStatic(app);

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

// Start server
let server: ReturnType<typeof Bun.serve> | null = null;

function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  if (server) {
    server.stop();
    console.log('Server closed');
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
    process.exit(0);
    // Force exit after 10 seconds
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Log startup info
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Config source: ${getConfigSource()}`);
console.log(`Database: ${config.database.dialect}`);
console.log(`Server: http://${config.server.host}:${config.server.port}`);

export default {
  fetch: app.fetch,
  port: config.server.port,
  websocket,
};

export { app };
