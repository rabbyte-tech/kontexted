import { Hono } from "hono";
import { parseSlug } from "@/lib/params";
import { resolveWorkspaceId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";
import { requireAuth } from "@/routes/middleware/require-auth";
import type { Variables } from "@/routes/types";

const app = new Hono<{ Variables: Variables }>();

app.get("/", requireAuth, async (c) => {
  const workspaceSlug = c.req.param("workspaceSlug");
  const workspaceSlugValue = parseSlug(workspaceSlug);

  if (!workspaceSlugValue) {
    return c.json({ error: "Invalid workspace slug" }, 400);
  }

  const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
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
    // Note: Don't close controller here - let cancel/start handle that
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
      // Note: Controller is automatically closed when cancel is called
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

export { app };
