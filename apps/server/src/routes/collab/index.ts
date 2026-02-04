import { Hono } from "hono";
import { app as tokenApp } from "./token";
import { app as statusApp } from "./status";
import { app as saveApp } from "./save";

// Compose all collab sub-routers
const collabApp = new Hono()
  .route("/token", tokenApp)
  .route("/status", statusApp)
  .route("/save", saveApp);

export { collabApp };
