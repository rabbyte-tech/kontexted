import { z } from "zod";

export function parseSlug(value: string): string | null {
  const result = z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).safeParse(value);
  return result.success ? result.data : null;
}

export function parsePublicId(value: string): string | null {
  const result = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).safeParse(value);
  return result.success ? result.data : null;
}
