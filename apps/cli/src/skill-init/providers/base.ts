/**
 * Options passed to skill content generator functions
 */
export interface SkillContentOptions {
  /** Profile alias to substitute in commands */
  alias?: string;
  /** Whether the profile has write permissions */
  hasWrite: boolean;
}

/**
 * Definition of a skill to be generated
 */
export interface SkillDefinition {
  /** Skill name (must match directory name, lowercase alphanumeric with hyphens) */
  name: string;
  /** Short description (1-1024 characters) */
  description: string;
  /** Static content string OR content generator function that receives options */
  content: string | ((options: SkillContentOptions) => string);
}

/**
 * Options for skill content generation
 */
export interface GenerateContentOptions {
  /** Optional alias to include in frontmatter */
  alias?: string;
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
  generateSkillContent(skill: SkillDefinition, resolvedContent: string, options?: GenerateContentOptions): string;
}
