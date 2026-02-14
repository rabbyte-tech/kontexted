#!/usr/bin/env bun
/**
 * Build script for compiling the migration script to a standalone executable.
 * 
 * Builds for ALL supported architectures by default.
 * 
 * Usage:
 *   bun scripts/build-migrate.ts              # Build all architectures
 *   bun scripts/build-migrate.ts --arch=darwin-arm64  # Build specific arch
 * 
 * Environment Variables:
 *   KONTEXTED_BUILD_ARCH - Target single architecture (e.g., "darwin-arm64")
 */

import { $ } from "bun";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const REPO_ROOT = join(ROOT_DIR, "..", "..");
const BUILD_DIR = join(REPO_ROOT, "build");

const SUPPORTED_ARCHS = [
  "darwin-arm64",
  "linux-x64",
  "windows-x64",
] as const;

type Arch = typeof SUPPORTED_ARCHS[number];

function detectCurrentArch(): Arch | null {
  const platform = process.platform;
  const arch = process.arch;
  
  const archMap: Record<string, Arch> = {
    "darwin-arm64": "darwin-arm64",
    "linux-x64": "linux-x64",
    "win32-x64": "windows-x64", // Map win32 to windows
  };
  
  return archMap[`${platform}-${arch}`] || null;
}

async function buildForArch(arch: Arch): Promise<{ arch: Arch; success: boolean; error?: string }> {
  const ARCH_BUILD_DIR = join(BUILD_DIR, arch);
  const OUTPUT_PATH = join(ARCH_BUILD_DIR, "bin", "kontexted-migrate");

  console.log(`\n[build:migrate] Building for ${arch}...`);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });

  try {
    const currentArch = detectCurrentArch();
    const needsTarget = arch !== currentArch;
    
    let result;
    if (needsTarget) {
      result = await $`bun build ${join(ROOT_DIR, "src/db/migrate.mjs")} --compile --target=${arch} --outfile ${OUTPUT_PATH}`.quiet();
    } else {
      result = await $`bun build ${join(ROOT_DIR, "src/db/migrate.mjs")} --compile --outfile ${OUTPUT_PATH}`.quiet();
    }

    if (result.exitCode === 0) {
      console.log(`[build:migrate] ✓ ${arch}: Success`);
      return { arch, success: true };
    } else {
      const error = result.stderr.toString() || "Unknown error";
      console.log(`[build:migrate] ✗ ${arch}: Failed - ${error.slice(0, 100)}`);
      return { arch, success: false, error };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.log(`[build:migrate] ✗ ${arch}: Failed - ${error.slice(0, 100)}`);
    return { arch, success: false, error };
  }
}

async function main() {
  console.log("[build:migrate] Building migration executable...");
  console.log(`[build:migrate] Build directory: ${BUILD_DIR}`);

  const archArg = process.argv.find((arg) => arg.startsWith("--arch="));
  const singleArch = archArg?.split("=")[1] || process.env.KONTEXTED_BUILD_ARCH;

  let archsToBuild: Arch[];
  if (singleArch) {
    if (!SUPPORTED_ARCHS.includes(singleArch as Arch)) {
      console.error(`[build:migrate] ✗ Unknown architecture: ${singleArch}`);
      process.exit(1);
    }
    archsToBuild = [singleArch as Arch];
  } else {
    archsToBuild = [...SUPPORTED_ARCHS];
  }

  const currentArch = detectCurrentArch();
  console.log(`[build:migrate] Current platform: ${currentArch || "unknown"}`);
  console.log(`[build:migrate] Building: ${archsToBuild.join(", ")}`);

  const results = [];
  for (const arch of archsToBuild) {
    results.push(await buildForArch(arch));
  }

  // Summary
  console.log("\n[build:migrate] ========== BUILD SUMMARY ==========");
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  for (const r of succeeded) {
    console.log(`[build:migrate] ✓ ${r.arch}`);
  }
  for (const r of failed) {
    console.log(`[build:migrate] ✗ ${r.arch}: ${r.error?.slice(0, 60) || "Failed"}`);
  }

  console.log(`\n[build:migrate] ${succeeded.length}/${results.length} architectures succeeded`);

  if (singleArch && failed.length > 0) {
    process.exit(1);
  }
}

main();
