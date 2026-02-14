import type { SkillProvider } from "@/skill-init/providers/base";
import { opencodeProvider } from "@/skill-init/providers/opencode";

export type { SkillProvider, SkillDefinition } from "@/skill-init/providers/base";

/** List of available skill provider IDs */
export const availableProviders = ["opencode"] as const;

/** Type representing valid provider IDs */
export type ProviderId = (typeof availableProviders)[number];

/**
 * Get a skill provider by its ID
 * @param id - The provider ID to look up
 * @returns The corresponding SkillProvider
 * @throws Error if the provider ID is not found
 */
export function getProvider(id: ProviderId): SkillProvider {
  switch (id) {
    case "opencode":
      return opencodeProvider;
    default:
      throw new Error(`Unknown skill provider: ${id}`);
  }
}
