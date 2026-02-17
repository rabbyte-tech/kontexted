import { Hono } from "hono";
import type { Variables } from "@/routes/types";

const app = new Hono<{ Variables: Variables }>();

app.get("/", (c) => {
  const authMethod = global.KONTEXTED_CONFIG.auth.method;
  const inviteCodeAvailable = !!global.KONTEXTED_CONFIG?.auth?.inviteCode;
  
  return c.json({
    authMethod,
    inviteCodeAvailable,
  });
});

export { app as configApp };
