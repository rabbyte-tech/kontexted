import { Hono } from "hono";
import type { Variables } from "@/routes/types";

const app = new Hono<{ Variables: Variables }>();

app.get("/", (c) => {
  const authMethod = process.env.AUTH_METHOD === 'keycloak' ? 'keycloak' : 'email-password';
  const inviteCodeAvailable = !!global.KONTEXTED_CONFIG?.auth?.inviteCode;
  
  return c.json({
    authMethod,
    inviteCodeAvailable,
  });
});

export { app as configApp };
