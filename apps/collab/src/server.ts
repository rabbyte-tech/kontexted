import { Hono } from "hono";
import { createNodeWebSocket } from "@hono/node-ws";
import { serve } from "@hono/node-server";

import { getToken, verifyToken } from "./auth";
import { env } from "./env";
import {
  checkNeedsReseed,
  ensureRoomState,
  getRoomStatus,
  manualSaveRoom,
  markRoomActivity,
  reseedDocumentFromDb,
  seedDocumentIfEmpty,
  clearRoomState,
} from "./checkpoints";
import { resolveRoomName } from "./rooms";
import { createNodeWebSocketAdapter, type NodeWebSocketAdapter } from "./ws-adapter";
import { getRoom, removeRoom, setupWSConnection } from "./y-websocket-server";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.post("/api/status", async (c) => {
  const token = getToken(c.req.raw);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await verifyToken(token);
    if (!payload.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const roomName = resolveRoomName(payload);
    const status = getRoomStatus(roomName);

    if (!status) {
      return c.json({
        active: false,
        hasUnsavedChanges: false,
        lastSavedAt: null,
        checkpointInFlight: false,
      });
    }

    return c.json({
      active: true,
      hasUnsavedChanges: status.hasUnsavedChanges,
      lastSavedAt: status.lastSavedAt ? status.lastSavedAt.toISOString() : null,
      checkpointInFlight: status.checkpointInFlight,
    });
  } catch (error) {
    console.warn("Status check failed", error);
    return c.json({ error: "Unable to fetch status" }, 500);
  }
});

app.post("/api/save", async (c) => {
  const token = getToken(c.req.raw);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await verifyToken(token);
    if (!payload.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const includeBlame =
      typeof body === "object" && body ? (body as { includeBlame?: boolean }).includeBlame : false;
    const roomName = resolveRoomName(payload);

    const result = await manualSaveRoom(roomName, payload.userId, includeBlame ?? false);
    return c.json(result);
  } catch (error) {
    console.warn("Manual save failed", error);
    if (error instanceof Error && error.message.includes("not active")) {
      return c.json({ error: "Room is not active" }, 409);
    }
    return c.json({ error: "Unable to save" }, 500);
  }
});

// Create WebSocket helper
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

const wsHandler = upgradeWebSocket(async (c) => {
  const req = c.req.raw;
  let roomName: string | null = null;
  let adapter: NodeWebSocketAdapter | null = null;
  let userId: string | null = null;

  return {
    async onOpen(event, ws) {
      const token = getToken(req);
      if (!token) {
        ws.close(1008, "Unauthorized");
        return;
      }

      try {
        const payload = await verifyToken(token);
        if (!payload.userId) {
          ws.close(1008, "Unauthorized");
          return;
        }
        userId = payload.userId;
        roomName = resolveRoomName(payload);

        console.log(`[server] New connection to ${roomName}, userId: ${userId}`);

        adapter = createNodeWebSocketAdapter(ws);

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

        const yText = room.getText("content");

        yText.observe(() => {
          const content = room.getText("content").toString();
          if (room.userId) {
            void markRoomActivity(roomName!, room.userId).catch((error) => {
              console.warn("Failed to mark activity", error);
            });
          }
        });

        console.log(`[server] Connection ready for ${roomName}, userId: ${userId}`);
      } catch (error) {
        console.warn("Websocket auth failed", error);
        ws.close(1008, "Unauthorized");
      }
    },
    onMessage(event, ws) {
      if (!adapter) {
        return;
      }
      adapter.emit("message", event.data);
    },
    onClose(event, ws) {
      const room = roomName ? getRoom(roomName!) : null;
      console.log(`[server] Connection closed from ${roomName}, conns remaining: ${room?.conns.size || 0}`);
      if (adapter) {
        adapter.emit("close");
      }

      if (!roomName || !room) {
        return;
      }

      // Delay cleanup to allow reconnects
      setTimeout(() => {
        const currentRoom = getRoom(roomName!);
        if (!currentRoom || currentRoom.conns.size === 0) {
          console.log(`[server] Cleaning up inactive room: ${roomName}`);
          clearRoomState(roomName!);
          removeRoom(roomName!);
        }
      }, 10000);
    },
    onError(event, ws) {
      console.warn(`[server] WebSocket error for ${roomName}:`, event);
    },
  };
});

app.get("/ws", wsHandler);
app.get("/ws/*", wsHandler);

// Create HTTP server
const server = serve({
  fetch: app.fetch.bind(app),
  port: env.port,
});

// Inject WebSocket support into the server
injectWebSocket(server);

console.log(`Collab server listening on http://localhost:${env.port}`);
