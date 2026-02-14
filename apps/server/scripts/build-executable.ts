#!/usr/bin/env bun
/**
 * Build script for compiling the server to a standalone Bun executable.
 * 
 * Builds for ALL supported architectures by default.
 * Note: Cross-compilation is not supported by Bun, so only the current
 * platform's build will succeed when run locally.
 * 
 * Usage:
 *   bun scripts/build-executable.ts              # Build all architectures
 *   bun scripts/build-executable.ts --arch=darwin-arm64  # Build specific arch
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

/**
 * Detect current platform architecture
 */
function detectCurrentArch(): Arch | null {
  const platform = process.platform;
  const arch = process.arch;
  
  const archMap: Record<string, Arch> = {
    "darwin-arm64": "darwin-arm64",
    "linux-x64": "linux-x64",
    "win32-x64": "windows-x64", // Map win32 to windows
  };
  
  const key = `${platform}-${arch}`;
  return archMap[key] || null;
}

/**
 * Build executable for a specific architecture
 */
async function buildForArch(arch: Arch): Promise<{ arch: Arch; success: boolean; error?: string }> {
  const ARCH_BUILD_DIR = join(BUILD_DIR, arch);
  const OUTPUT_PATH = join(ARCH_BUILD_DIR, "bin", "kontexted");

  console.log(`\n[build] Building for ${arch}...`);
  console.log(`[build] Output: ${OUTPUT_PATH}`);

  // Create build directory structure
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });

  try {
    // Build with target if specified and different from current
    const currentArch = detectCurrentArch();
    const needsTarget = arch !== currentArch;
    
    let result;
    if (needsTarget) {
      // Attempt cross-compilation (will likely fail, but try anyway)
      result = await $`bun build ${join(ROOT_DIR, "src/index.ts")} --compile --target=${arch} --outfile ${OUTPUT_PATH}`.quiet();
    } else {
      result = await $`bun build ${join(ROOT_DIR, "src/index.ts")} --compile --outfile ${OUTPUT_PATH}`.quiet();
    }

    if (result.exitCode === 0) {
      console.log(`[build] ✓ ${arch}: Success`);
      return { arch, success: true };
    } else {
      const error = result.stderr.toString() || "Unknown error";
      console.log(`[build] ✗ ${arch}: Failed - ${error.slice(0, 100)}`);
      return { arch, success: false, error };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.log(`[build] ✗ ${arch}: Failed - ${error.slice(0, 100)}`);
    return { arch, success: false, error };
  }
}

async function main() {
  console.log("[build] Building Kontexted server executable...");
  console.log(`[build] Root directory: ${ROOT_DIR}`);
  console.log(`[build] Build directory: ${BUILD_DIR}`);

  // Check for single arch override
  const archArg = process.argv.find((arg) => arg.startsWith("--arch="));
  const singleArch = archArg?.split("=")[1] || process.env.KONTEXTED_BUILD_ARCH;

  let archsToBuild: Arch[];
  if (singleArch) {
    if (!SUPPORTED_ARCHS.includes(singleArch as Arch)) {
      console.error(`[build] ✗ Unknown architecture: ${singleArch}`);
      console.error(`[build]   Supported: ${SUPPORTED_ARCHS.join(", ")}`);
      process.exit(1);
    }
    archsToBuild = [singleArch as Arch];
    console.log(`[build] Building single architecture: ${singleArch}`);
  } else {
    archsToBuild = [...SUPPORTED_ARCHS];
    console.log(`[build] Building all architectures: ${archsToBuild.join(", ")}`);
  }

  const currentArch = detectCurrentArch();
  console.log(`[build] Current platform: ${currentArch || "unknown"}`);

  // Build for each architecture
  const results = [];
  for (const arch of archsToBuild) {
    results.push(await buildForArch(arch));
  }

  // Summary
  console.log("\n[build] ========== BUILD SUMMARY ==========");
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  for (const r of succeeded) {
    console.log(`[build] ✓ ${r.arch}: ${join(BUILD_DIR, r.arch, "bin", "kontexted")}`);
  }
  for (const r of failed) {
    console.log(`[build] ✗ ${r.arch}: ${r.error?.slice(0, 80) || "Failed"}`);
  }

  console.log(`\n[build] ${succeeded.length}/${results.length} architectures succeeded`);

  // Exit with error if any build failed and we were building a single arch
  if (singleArch && failed.length > 0) {
    process.exit(1);
  }
}

main();
