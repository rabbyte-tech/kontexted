import { Hono } from "hono";
import type { Variables } from "@/routes/types";

const app = new Hono<{ Variables: Variables }>();

app.get("/", (c) => {
  const authMethod = global.KONTEXTED_CONFIG.auth.method;
  const inviteCodeAvailable = !!global.KONTEXTED_CONFIG?.auth?.inviteCode;
  const defaultConvention = global.KONTEXTED_CONFIG?.naming?.defaultConvention ?? 'kebab-case';
  
  return c.json({
    authMethod,
    inviteCodeAvailable,
    naming: {
      defaultConvention,
    },
  });
});

export { app as configApp };
