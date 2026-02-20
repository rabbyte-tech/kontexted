import { promises as fs } from 'fs';
import path from 'path';
import type { SkillDefinition, SkillProvider, SkillContentOptions } from '@/skill-init/providers/base';

/**
 * Options for initializing a skill
 */
export interface InitSkillOptions {
  /** The skill to initialize */
  skill: SkillDefinition;
  /** The provider to use */
  provider: SkillProvider;
  /** Base directory (defaults to current working directory) */
  basePath?: string;
  /** Profile alias to embed in skill content */
  alias?: string;
  /** Whether the profile has write permissions */
  hasWrite?: boolean;
}

/**
 * Result of initializing a skill
 */
export interface InitSkillResult {
  /** Path where the skill was written */
  path: string;
  /** Whether the skill was newly created or overwritten */
  created: boolean;
  /** Name of the skill */
  name: string;
}

/**
 * Creates a directory (and parent directories) if it doesn't exist.
 * Uses `fs/promises` with `mkdir` and `recursive: true`.
 *
 * @param dirPath - The directory path to ensure exists
 * @returns Promise that resolves when the directory is ready
 * @throws Error if the directory cannot be created
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to create directory "${dirPath}": ${error.message}`);
    }
    throw new Error(`Failed to create directory "${dirPath}": Unknown error`);
  }
}

/**
 * Checks if a file exists at the given path.
 *
 * @param filePath - The file path to check
 * @returns Promise that resolves to true if the file exists, false otherwise
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes content to a file, creating parent directories if needed.
 *
 * @param filePath - The path of the file to write
 * @param content - The content to write to the file
 * @returns Promise that resolves when the file has been written
 * @throws Error if the file cannot be written
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const dirPath = path.dirname(absolutePath);

  // Ensure parent directory exists
  await ensureDirectory(dirPath);

  try {
    await fs.writeFile(absolutePath, content, 'utf-8');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to write file "${absolutePath}": ${error.message}`);
    }
    throw new Error(`Failed to write file "${absolutePath}": Unknown error`);
  }
}

/**
 * Validates a skill definition and returns an array of error messages.
 * Returns an empty array if the skill is valid.
 *
 * @param skill - The skill definition to validate
 * @param provider - The skill provider to use for name validation
 * @returns Array of error messages (empty if valid)
 */
export function validateSkill(skill: SkillDefinition, provider: SkillProvider): string[] {
  const errors: string[] = [];

  // Validate skill name using provider rules
  if (!skill.name || skill.name.trim().length === 0) {
    errors.push('Skill name is required');
  } else if (!provider.validateSkillName(skill.name)) {
    errors.push(
      `Invalid skill name "${skill.name}". Names must match provider rules (lowercase alphanumeric with hyphens).`
    );
  }

  // Validate description length
  if (!skill.description || skill.description.trim().length === 0) {
    errors.push('Skill description is required');
  } else if (skill.description.length < 1 || skill.description.length > 1024) {
    errors.push(`Skill description must be between 1 and 1024 characters (currently ${skill.description.length})`);
  }

  // Validate content is not empty (skip for generator functions)
  if (typeof skill.content === 'string') {
    if (!skill.content || skill.content.trim().length === 0) {
      errors.push('Skill content is required and cannot be empty');
    }
  }

  return errors;
}

/**
 * Initializes a skill by creating the necessary directory structure
 * and writing the skill file.
 *
 * @param options - The options for initializing the skill
 * @returns Promise that resolves to the initialization result
 * @throws Error if validation fails or if the skill cannot be written
 */
export async function initSkill(options: InitSkillOptions): Promise<InitSkillResult> {
  const { skill, provider, alias, hasWrite = false } = options;
  const basePath = options.basePath || process.cwd();

  // Validate the skill definition
  const validationErrors = validateSkill(skill, provider);
  if (validationErrors.length > 0) {
    throw new Error(`Skill validation failed:\n${validationErrors.join('\n')}`);
  }

  // Resolve content - handle both static string and generator function
  let resolvedContent: string;
  if (typeof skill.content === 'function') {
    resolvedContent = skill.content({ alias, hasWrite });
  } else {
    resolvedContent = skill.content;
  }

  // Get the skill path from the provider
  const relativeSkillPath = provider.getSkillPath(skill.name);
  const absoluteSkillPath = path.isAbsolute(relativeSkillPath)
    ? relativeSkillPath
    : path.resolve(basePath, relativeSkillPath);

  // Check if file already exists
  const alreadyExists = await fileExists(absoluteSkillPath);

  // Generate the skill content with resolved content and metadata
  const skillContent = provider.generateSkillContent(skill, resolvedContent, { alias });

  // Write the skill file
  await writeFile(absoluteSkillPath, skillContent);

  return {
    path: absoluteSkillPath,
    created: !alreadyExists,
    name: skill.name,
  };
}
