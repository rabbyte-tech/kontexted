/**
 * Definition of a skill to be generated
 */
export interface SkillDefinition {
  /** Skill name (must match directory name, lowercase alphanumeric with hyphens) */
  name: string;
  /** Short description (1-1024 characters) */
  description: string;
  /** The full skill content (markdown) */
  content: string;
}

/**
 * Provider interface for different AI agent platforms
 */
export interface SkillProvider {
  /** Unique provider identifier (e.g., 'opencode') */
  id: string;
  /** Human-readable provider name */
  name: string;
  /** Get the file path where a skill should be written */
  getSkillPath(skillName: string): string;
  /** Validate skill name according to provider rules */
  validateSkillName(name: string): boolean;
  /** Generate the complete skill file content including frontmatter */
  generateSkillContent(skill: SkillDefinition): string;
}
