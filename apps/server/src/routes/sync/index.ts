import { Hono } from "hono";
import { eventsApp } from "./events";
import { pullApp } from "./pull";
import { pushApp } from "./push";
import { statusApp } from "./status";

const syncApp = new Hono()
  .route("/events", eventsApp)
  .route("/pull", pullApp)
  .route("/push", pushApp)
  .route("/status", statusApp);

export { syncApp };
