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

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let abortListener: (() => void) | null = null;

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
          close();
        }
      };

      const unsubscribe = workspaceEventHub.subscribe(workspaceIdValue, (event) => {
        sendEvent({ type: event.type, data: event.data });
      });

      const heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch (error) {
            console.error("[SSE] Error enqueueing heartbeat:", error);
            close();
          }
        }
      }, 15000);

      sendEvent({ type: "ready", data: { ok: true } });

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        if (abortListener) {
          request.signal.removeEventListener("abort", abortListener);
          abortListener = null;
        }
        try {
          controller.close();
        } catch (error) {
          console.error("[SSE] Error closing controller:", error);
          // Controller already closed or errored, which is fine
        }
      };

      const handleAbort = () => {
        close();
      };
      abortListener = handleAbort;
      request.signal.addEventListener("abort", handleAbort, { once: true });
    },
    cancel(reason) {
      console.error("[SSE] Stream canceled by client:", reason);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});

export { app };
