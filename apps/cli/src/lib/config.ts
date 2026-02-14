import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Config } from "@/types";

const CONFIG_DIR = join(homedir(), ".kontexted");
const CONFIG_PATH = join(CONFIG_DIR, "profile.json");

/**
 * Read the configuration file from disk
 */
export async function readConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { profiles: {} };
    }
    return parsed.profiles ? { profiles: parsed.profiles } : { profiles: {} };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { profiles: {} };
    }
    throw error;
  }
}

/**
 * Write configuration to disk
 */
export async function writeConfig(config: Config): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Remove the entire config file
 */
export async function removeConfig(): Promise<void> {
  await rm(CONFIG_PATH, { force: true });
}

/**
 * Get the config file path (for display/debugging)
 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}
