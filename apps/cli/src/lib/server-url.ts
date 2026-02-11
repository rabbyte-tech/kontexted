/**
 * Resolve canonical server base URL.
 *
 * Accepted inputs:
 * - https://host
 * - host (will default to https)
 */
export function resolveServerUrl(input: string): string {
  let parsed: URL;

  // Add https:// if no protocol specified
  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    input = 'https://' + input;
  }

  try {
    parsed = new URL(input);
  } catch {
    throw new Error(
      `Invalid URL: ${input}. Provide a server URL like https://app.example.com or app.example.com`
    );
  }

  // Always use root as base path, ignore any path in input
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString().replace(/\/$/, "");
}
