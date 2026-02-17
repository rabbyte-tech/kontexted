import { resolveConfig, getConfigSource, type ServerConfig } from "./config-resolver.js";

// Resolve configuration once at module load time
// ESM guarantees this runs before any module that imports from this file
const config = resolveConfig();

// Set global for backward compatibility (used by auth hooks, etc.)
declare global {
  var KONTEXTED_CONFIG: typeof config;
}
global.KONTEXTED_CONFIG = config;

export { config, getConfigSource, type ServerConfig };
