import { createHash } from "crypto";

/**
 * Computes the SHA-256 hash of a string and returns it as a hexadecimal string.
 * Used for content hashing in the sync feature to detect changes.
 *
 * @param content - The string content to hash
 * @returns The hex-encoded SHA-256 hash
 */
export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
