import type { NamingConvention } from "./case-converter";

interface ClientConfig {
  naming: {
    defaultConvention: NamingConvention;
  };
}

let cachedConfig: ClientConfig | null = null;
let fetchPromise: Promise<ClientConfig> | null = null;

/**
 * Fetches client configuration from the server.
 *
 * @returns Promise resolving to the client configuration
 */
export async function fetchClientConfig(): Promise<ClientConfig> {
  // Return cached if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // Deduplicate concurrent requests
  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      const response = await fetch("/api/config");
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.status}`);
      }
      const data = await response.json();
      cachedConfig = {
        naming: {
          defaultConvention: data.naming?.defaultConvention ?? "kebab-case",
        },
      };
      return cachedConfig;
    } catch (error) {
      console.warn(
        "Failed to fetch client config, using defaults:",
        error
      );
      cachedConfig = {
        naming: {
          defaultConvention: "kebab-case",
        },
      };
      return cachedConfig;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Returns the cached naming convention synchronously.
 * Triggers a background fetch if not cached.
 *
 * @returns The cached naming convention, or 'kebab-case' as fallback
 */
export function getCachedNamingConvention(): NamingConvention {
  // Trigger background fetch if not cached
  if (!cachedConfig && !fetchPromise) {
    void fetchClientConfig();
  }

  // Return cached or default
  return cachedConfig?.naming.defaultConvention ?? "kebab-case";
}

export type { ClientConfig };
