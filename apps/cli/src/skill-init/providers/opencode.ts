import type { SkillDefinition, SkillProvider } from "@/skill-init/providers/base";

/** Options for skill content generation */
interface GenerateContentOptions {
  alias?: string;
}

/** OpenCode skill provider identifier */
const OPENCODE_PROVIDER_ID = "opencode";

/** OpenCode provider human-readable name */
const OPENCODE_PROVIDER_NAME = "OpenCode";

/** Regex for validating OpenCode skill names: lowercase alphanumeric with single hyphen separators */
const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * OpenCode provider implementation for skill generation
 */
export const opencodeProvider: SkillProvider = {
  id: OPENCODE_PROVIDER_ID,
  name: OPENCODE_PROVIDER_NAME,

  /**
   * Get the file path for an OpenCode skill
   * @param skillName - The skill name (already validated)
   * @returns The relative file path where the skill should be written
   */
  getSkillPath(skillName: string): string {
    return `.opencode/skills/${skillName}/SKILL.md`;
  },

  /**
   * Validate a skill name according to OpenCode rules
   * @param name - The skill name to validate
   * @returns true if the name is valid, false otherwise
   */
  validateSkillName(name: string): boolean {
    // Check length constraints
    if (name.length < 1 || name.length > 64) {
      return false;
    }

    // Validate against regex pattern
    return SKILL_NAME_REGEX.test(name);
  },

  /**
   * Generate the complete skill file content including frontmatter
   * @param skill - The skill definition (for name and description)
   * @param resolvedContent - The resolved content string (after generator function if applicable)
   * @param options - Optional metadata to include in frontmatter
   * @returns The complete markdown content with frontmatter
   */
  generateSkillContent(
    skill: SkillDefinition, 
    resolvedContent: string,
    options?: GenerateContentOptions
  ): string {
    const frontmatterLines = [
      `name: ${skill.name}`,
      `description: ${skill.description}`,
    ];
    
    // Add alias to frontmatter if provided
    if (options?.alias) {
      frontmatterLines.push(`alias: ${options.alias}`);
    }

    const frontmatter = `---\n${frontmatterLines.join('\n')}\n---`;

    return `${frontmatter}

${resolvedContent}`;
  }
};
