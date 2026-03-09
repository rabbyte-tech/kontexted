import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { RemoteNote } from "./types";

/**
 * Update .gitignore to exclude the sync directory.
 * Also creates a .ignore file with negation pattern for grep compatibility.
 *
 * @param syncDir - The sync directory name to exclude (e.g., ".kontexted-sync")
 */
export async function updateGitignore(syncDir: string): Promise<void> {
  const gitignorePath = join(process.cwd(), ".gitignore");

  let content = "";
  try {
    content = await readFile(gitignorePath, "utf-8");
  } catch {
    // File doesn't exist
  }

  if (!content.includes(`${syncDir}/`)) {
    content += `\n# Kontexted sync\n${syncDir}/\n`;
    await writeFile(gitignorePath, content, "utf-8");
  }

  // Create .ignore for grep compatibility
  const ignorePath = join(process.cwd(), ".ignore");
  let ignoreContent = "";
  try {
    ignoreContent = await readFile(ignorePath, "utf-8");
  } catch {
    // File doesn't exist
  }

  if (!ignoreContent.includes(`!${syncDir}/`)) {
    ignoreContent += `\n!${syncDir}/\n`;
    await writeFile(ignorePath, ignoreContent, "utf-8");
  }
}

/**
 * Parse markdown content to extract title and body.
 * Checks for frontmatter first, then falls back to H1 heading.
 *
 * @param content - The markdown content to parse
 * @returns Object containing extracted title and remaining body content
 */
export function parseMarkdown(content: string): { title: string; body: string } {
  // Check for frontmatter
  if (content.startsWith("---\n")) {
    const endIndex = content.indexOf("\n---\n", 4);
    if (endIndex !== -1) {
      const frontmatter = content.slice(4, endIndex);
      const body = content.slice(endIndex + 5);
      const titleMatch = frontmatter.match(/title:\s*(.+)/);
      return {
        title: titleMatch?.[1]?.trim() ?? "",
        body
      };
    }
  }

  // Check for H1 title
  const h1Match = content.match(/^#\s+(.+)$/m);
  return {
    title: h1Match?.[1]?.trim() ?? "",
    body: content
  };
}

/**
 * Format a remote note as markdown.
 * Adds title as H1 if not already present in content.
 *
 * @param note - The remote note to format
 * @returns Markdown-formatted string with title as H1
 */
export function formatMarkdown(note: RemoteNote): string {
  // Handle case where content is undefined (from some SSE events)
  const content = note.content ?? "";

  // If content starts with H1 matching title, keep as-is
  if (content.startsWith(`# ${note.title}`)) {
    return content;
  }

  // Otherwise, add title as H1
  return `# ${note.title}\n\n${content}`;
}

/**
 * Ensure a directory exists, creating it recursively if necessary.
 *
 * @param filePath - The file path whose directory should exist
 */
export async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
}

/**
 * Compute the relative file path for a note.
 * Uses the note's name with .md extension and folder path if present.
 *
 * @param note - The remote note to compute path for
 * @returns Relative file path (e.g., "folder/subfolder/note.md")
 */
export function computeFilePath(note: RemoteNote): string {
  const fileName = `${note.name}.md`;
  if (note.folderPath) {
    return join(note.folderPath, fileName);
  }
  return fileName;
}

/**
 * Execute a function with exponential backoff retry.
 *
 * @param fn - The async function to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @returns Promise that resolves with the function's result
 * @throws Last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const delay = baseDelay * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
