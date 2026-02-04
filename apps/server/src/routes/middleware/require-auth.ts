import { auth } from "@/auth";
import type { Context, Next } from "hono";
import type { Variables } from "@/routes/types";

export const requireAuth = async (c: Context<{ Variables: Variables }>, next: Next) => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(c.req.header())) {
    if (Array.isArray(value)) {
      value.forEach((v) => headers.append(key, v as string));
    } else if (value !== undefined) {
      headers.append(key, value as string);
    }
  }

  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("session", session);
  await next();
};
