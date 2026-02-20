/**
 * Utility for building CLI commands in a structured, extensible way.
 * Provides a fluent API for constructing kontexted CLI commands with
 * options and flags.
 */
export class CliCommandBuilder {
  private readonly cliName = 'kontexted'
  private commandName: string = ''
  private options: Map<string, string> = new Map()
  private flags: Map<string, boolean> = new Map()

  /**
   * Set the base command name
   * @param name - The command name (e.g., 'login', 'config')
   */
  command(name: string): this {
    this.commandName = name
    return this
  }

  /**
   * Add a key-value option
   * @param key - Option name (e.g., 'url', 'workspace')
   * @param value - Option value
   */
  option(key: string, value: string): this {
    this.options.set(key, value)
    return this
  }

  /**
   * Add a boolean flag
   * @param key - Flag name (e.g., 'write')
   * @param enabled - Whether to include the flag
   */
  flag(key: string, enabled: boolean): this {
    this.flags.set(key, enabled)
    return this
  }

  /**
   * Build the command string
   * @param format - 'single' for single line, 'multi' for multi-line
   */
  build(format: 'single' | 'multi' = 'multi'): string {
    if (!this.commandName) {
      return this.cliName
    }

    const parts: string[] = [this.cliName, this.commandName]

    // Add options as --key value
    for (const [key, value] of this.options) {
      parts.push(`--${key}`, value)
    }

    // Add flags as --flag (only when enabled)
    for (const [key, enabled] of this.flags) {
      if (enabled) {
        parts.push(`--${key}`)
      }
    }

    if (format === 'single') {
      return parts.join(' ')
    }

    // Multi-line format with line continuation
    const base = `${parts[0]} ${parts[1]}`
    const continuationParts = parts.slice(2)

    if (continuationParts.length === 0) {
      return base
    }

    const continuation = continuationParts.join(' \\\n    ')
    return `${base} \\\n    ${continuation}`
  }
}
