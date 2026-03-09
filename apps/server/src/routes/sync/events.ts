import { Hono } from "hono";
import { parseSlug } from "@/lib/params";
import { resolveWorkspaceId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";
import { verifyBearerToken } from "@/lib/auth-utils";

const eventsApp = new Hono();

/**
 * GET /api/sync/events - SSE endpoint for workspace events
 *
 * Query params:
 * - workspaceSlug (required): The workspace slug
 *
 * Uses Bearer token authentication (JWT).
 */
eventsApp.get("/", async (c) => {
  // Verify JWT Bearer token
  const payload = await verifyBearerToken(c.req.raw);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workspaceSlug = c.req.query("workspaceSlug");
  if (!workspaceSlug) {
    return c.json({ error: "workspaceSlug is required" }, 400);
  }

  const validatedSlug = parseSlug(workspaceSlug);
  if (!validatedSlug) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(validatedSlug);
  if (!workspaceIdValue) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const encoder = new TextEncoder();
  const request = c.req.raw;

  // MOVED OUTSIDE ReadableStream - accessible by both start and cancel
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let abortListener: (() => void) | null = null;

  // MOVED OUTSIDE ReadableStream - cleanup function accessible by cancel
  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;

    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (abortListener) {
      request.signal.removeEventListener("abort", abortListener);
      abortListener = null;
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (payload: { type: string; data: unknown }) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(
            encoder.encode(`event: ${payload.type}\ndata: ${JSON.stringify(payload.data)}\n\n`)
          );
        } catch (error) {
          console.error(`[SSE] Error enqueueing event of type '${payload.type}':`, error);
          cleanup();
          try {
            controller.close();
          } catch {
            // Controller already closed
          }
        }
      };

      unsubscribe = workspaceEventHub.subscribe(workspaceIdValue, (event) => {
        sendEvent({ type: event.type, data: event.data });
      });

      heartbeat = setInterval(() => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch (error) {
          console.error("[SSE] Error enqueueing heartbeat:", error);
          cleanup();
          try {
            controller.close();
          } catch {
            // Controller already closed
          }
        }
      }, 10000);

      sendEvent({ type: "ready", data: { ok: true } });

      const handleAbort = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Controller already closed
        }
      };
      abortListener = handleAbort;
      request.signal.addEventListener("abort", handleAbort, { once: true });
    },
    cancel(reason) {
      console.debug("[SSE] Stream canceled:", reason);
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});

export { eventsApp };
