import { createRequire } from 'module';
import { existsSync } from 'fs';
import { join } from 'path';
import { PLATFORM_PACKAGES, KONTEXTED_DIR } from './constants.js';

/**
 * Gets the current platform identifier (e.g., "darwin-arm64")
 */
export function getPlatform(): string {
  return `${process.platform}-${process.arch}`;
}

/**
 * Checks if the current platform is supported
 */
export function isPlatformSupported(): boolean {
  const platform = getPlatform();
  return platform in PLATFORM_PACKAGES;
}

/**
 * Gets the package name for the current platform
 */
export function getPlatformPackage(): string | null {
  const platform = getPlatform();
  return PLATFORM_PACKAGES[platform] || null;
}

/**
 * Resolves the path to the server binary
 * Returns null if the package is not installed or platform is unsupported
 */
export function getBinaryPath(): string | null {
  if (!isPlatformSupported()) {
    return null;
  }

  const pkg = getPlatformPackage();
  if (!pkg) {
    return null;
  }

  try {
    // Use createRequire to resolve the package location
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve(`${pkg}/package.json`);
    const binaryName = process.platform === 'win32' ? 'kontexted.exe' : 'kontexted';
    const binPath = join(packagePath, '..', 'bin', binaryName);

    if (existsSync(binPath)) {
      return binPath;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves the path to the migration tool binary
 * Returns null if the package is not installed or platform is unsupported
 */
export function getMigratePath(): string | null {
  if (!isPlatformSupported()) {
    return null;
  }

  const pkg = getPlatformPackage();
  if (!pkg) {
    return null;
  }

  try {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve(`${pkg}/package.json`);
    const binaryName = process.platform === 'win32' ? 'kontexted-migrate.exe' : 'kontexted-migrate';
    const migratePath = join(packagePath, '..', 'bin', binaryName);

    if (existsSync(migratePath)) {
      return migratePath;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves the path to the migrations directory
 * Returns null if the package is not installed or platform is unsupported
 */
export function getMigrationsDir(): string | null {
  if (!isPlatformSupported()) {
    return null;
  }

  const pkg = getPlatformPackage();
  if (!pkg) {
    return null;
  }

  try {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve(`${pkg}/package.json`);
    const migrationsDir = join(packagePath, '..', 'migrations');

    if (existsSync(migrationsDir)) {
      return migrationsDir;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves the path to the public directory (frontend assets)
 * Returns null if the package is not installed or platform is unsupported
 */
export function getPublicDir(): string | null {
  if (!isPlatformSupported()) {
    return null;
  }

  const pkg = getPlatformPackage();
  if (!pkg) {
    return null;
  }

  try {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve(`${pkg}/package.json`);
    const publicDir = join(packagePath, '..', 'public');

    if (existsSync(publicDir)) {
      return publicDir;
    }

    return null;
  } catch {
    return null;
  }
}
