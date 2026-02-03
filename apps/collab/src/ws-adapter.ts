type WebSocketEventHandler = (data?: unknown) => void;

type HandlerMap = {
  message?: WebSocketEventHandler;
  close?: WebSocketEventHandler;
  error?: WebSocketEventHandler;
  pong?: WebSocketEventHandler;
};

import type { WebSocket } from "ws";

export const createNodeWebSocketAdapter = (ws: WebSocket) => {
  const handlers: HandlerMap = {};

  const adapter = {
    binaryType: "arraybuffer" as BinaryType,
    get readyState() {
      return ws.readyState;
    },
    send(data: Uint8Array | ArrayBuffer, callback?: (error?: unknown) => void) {
      try {
        ws.send(data);
        callback?.();
      } catch (error) {
        callback?.(error);
      }
    },
    close(code?: number, reason?: string) {
      ws.close(code, reason);
    },
    ping() {
      try {
        // @ts-ignore - ws may not have ping, but it's optional
        if (typeof ws.ping === 'function') {
          ws.ping();
        }
      } catch (error) {
        handlers.pong?.();
      }
    },
    on(event: "message" | "close" | "error" | "pong", handler: WebSocketEventHandler) {
      // Store the handler - y-websocket-server calls this to register event callbacks
      handlers[event] = handler;
    },
    emit(event: "message" | "close" | "error" | "pong", data?: unknown) {
      // Trigger the stored handler - @hono/node-ws handlers call this
      handlers[event]?.(data);
    },
  };

  return adapter;
};

export type NodeWebSocketAdapter = ReturnType<typeof createNodeWebSocketAdapter>;
