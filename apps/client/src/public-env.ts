/**
 * Public environment variables for Kontexted Client
 */

export function getPublicEnv() {
  return {
    // Public env vars (none needed for collab)
  }
}

export type PublicEnv = ReturnType<typeof getPublicEnv>
