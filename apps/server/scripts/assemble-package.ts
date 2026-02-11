#!/usr/bin/env bun
/**
 * Assemble the npm package from compiled artifacts for ALL architectures.
 * 
 * This script:
 * 1. Assembles packages for all supported architectures
 * 2. Copies migrations and client assets
 * 3. Creates architecture-specific package.json files
 * 
 * Prerequisites:
 *   - Client must be built (apps/client/dist/)
 *   - Executables should be built first (run build:all)
 * 
 * Usage:
 *   bun scripts/assemble-package.ts              # Assemble all architectures
 *   bun scripts/assemble-package.ts --arch=darwin-arm64  # Single arch
 * 
 * Environment Variables:
 *   KONTEXTED_BUILD_ARCH - Target single architecture
 */

import { existsSync, writeFileSync, cpSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const REPO_ROOT = join(ROOT_DIR, "..", "..");
const BUILD_DIR = join(REPO_ROOT, "build");

const CLIENT_DIST = join(REPO_ROOT, "apps", "client", "dist");

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

function getOsForArch(arch: Arch): string[] {
  if (arch.startsWith("darwin")) return ["darwin"];
  if (arch.startsWith("linux")) return ["linux"];
  if (arch.startsWith("windows")) return ["win32"];
  return ["darwin", "linux"];
}

function getCpuForArch(arch: Arch): string[] {
  if (arch.includes("arm64")) return ["arm64"];
  if (arch.includes("x64")) return ["x64"];
  return ["arm64", "x64"];
}

async function assembleForArch(arch: Arch, version: string): Promise<{ arch: Arch; success: boolean }> {
  const ARCH_BUILD_DIR = join(BUILD_DIR, arch);

  console.log(`\n[assemble] Assembling for ${arch}...`);
  console.log(`[assemble] Package directory: ${ARCH_BUILD_DIR}`);

  // Check if executables exist
  const executables = [
    join(ARCH_BUILD_DIR, "bin", "kontexted"),
    join(ARCH_BUILD_DIR, "bin", "kontexted-migrate"),
  ];

  let hasExecutables = true;
  for (const exe of executables) {
    if (existsSync(exe)) {
      console.log(`[assemble] ✓ Found: bin/${exe.split("/").pop()}`);
    } else {
      console.warn(`[assemble] ⚠ Missing: ${exe}`);
      hasExecutables = false;
    }
  }

  // Create package directories
  const directories = [
    join(ARCH_BUILD_DIR, "public"),
    join(ARCH_BUILD_DIR, "migrations", "sqlite", "meta"),
    join(ARCH_BUILD_DIR, "migrations", "postgresql", "meta"),
  ];

  for (const dir of directories) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`[assemble] Created: ${dir.replace(ARCH_BUILD_DIR, "")}`);
    }
  }

  // Copy migrations
  const migrationsSrc = join(ROOT_DIR, "src", "migrations");
  for (const dialect of ["sqlite", "postgresql"]) {
    const srcDir = join(migrationsSrc, dialect);
    const destDir = join(ARCH_BUILD_DIR, "migrations", dialect);
    
    if (existsSync(srcDir)) {
      cpSync(srcDir, destDir, { recursive: true });
      console.log(`[assemble] Copied: migrations/${dialect}/`);
    }
  }

  // Copy client assets
  if (existsSync(CLIENT_DIST)) {
    cpSync(CLIENT_DIST, join(ARCH_BUILD_DIR, "public"), { recursive: true });
    console.log(`[assemble] Copied: public/`);
  } else {
    console.warn(`[assemble] ⚠ Client dist not found: ${CLIENT_DIST}`);
  }

  // Create package.json
  const packageJson = {
    name: `@kontexted/${arch}`,
    version: version,
    description: `Kontexted Server - Compiled executable (${arch})`,
    files: ["bin/", "public/", "migrations/"],
    repository: {
      type: "git",
      url: "https://github.com/anomalyco/kontexted.git",
      directory: "apps/server",
    },
    license: "MIT",
    os: getOsForArch(arch),
    cpu: getCpuForArch(arch),
  };

  writeFileSync(join(ARCH_BUILD_DIR, "package.json"), JSON.stringify(packageJson, null, 2));
  console.log(`[assemble] Created: package.json`);

  const success = hasExecutables || existsSync(join(ARCH_BUILD_DIR, "package.json"));
  console.log(`[assemble] ✓ ${arch}: Complete`);
  
  return { arch, success };
}

async function main() {
  // Read version from server's package.json
  const serverPackageJson = JSON.parse(
    readFileSync(join(ROOT_DIR, "package.json"), "utf-8")
  );
  const VERSION = serverPackageJson.version;

  console.log("[assemble] Assembling npm packages...");
  console.log(`[assemble] Build directory: ${BUILD_DIR}`);
  console.log(`[assemble] Version: ${VERSION}`);

  const archArg = process.argv.find((arg) => arg.startsWith("--arch="));
  const singleArch = archArg?.split("=")[1] || process.env.KONTEXTED_BUILD_ARCH;

  let archsToBuild: Arch[];
  if (singleArch) {
    if (!SUPPORTED_ARCHS.includes(singleArch as Arch)) {
      console.error(`[assemble] ✗ Unknown architecture: ${singleArch}`);
      process.exit(1);
    }
    archsToBuild = [singleArch as Arch];
  } else {
    archsToBuild = [...SUPPORTED_ARCHS];
  }

  console.log(`[assemble] Assembling: ${archsToBuild.join(", ")}`);

  const results = [];
  for (const arch of archsToBuild) {
    results.push(await assembleForArch(arch, VERSION));
  }

  // Summary
  console.log("\n[assemble] ========== ASSEMBLY SUMMARY ==========");
  for (const r of results) {
    const status = r.success ? "✓" : "⚠";
    console.log(`[assemble] ${status} ${r.arch}: ${join(BUILD_DIR, r.arch)}`);
  }

  console.log(`\n[assemble] ✓ ${results.length} packages assembled`);
  console.log("\n[assemble] To publish:");
  for (const r of results) {
    console.log(`  cd ${join(BUILD_DIR, r.arch)} && npm publish`);
  }
}

main();
