---
name: kontexted-cli
description: Access and manage Kontexted workspaces, search notes, and retrieve content through the kontexted CLI. Use when the user needs to explore workspace structure, find specific notes, or read note content using profile aliases.
---

# Kontexted CLI Skill Commands

\`\`\`
kontexted skill workspace-tree --alias <profile>                    # Get workspace folder/note structure
kontexted skill search-notes --alias <profile> --query "<text>"    # Search notes
kontexted skill note-by-id --alias <profile> --note-id <id>        # Get specific note
\`\`\`

## Prerequisites

Before using the kontexted CLI skill commands, ensure:

1. **kontexted CLI is installed** - Install via npm or your preferred package manager
2. **User has authenticated** - User must have run \`kontexted login\` with a profile alias
3. **Profile has a workspace configured** - The profile alias must be associated with an active workspace

All commands require the \`--alias\` parameter to specify which profile to use. The profile must already be set up and authenticated.

## Available Tools

### workspace-tree

Get the complete folder and note structure of a workspace.

\`\`\`bash
kontexted skill workspace-tree --alias <profile>
\`\`\`

**Options:**
- \`--alias\` (required): The profile alias to use for authentication

**Returns:** JSON object containing the workspace structure with folders and notes hierarchy

**When to use:**
- When you need to understand the organization of a workspace
- When exploring available notes before reading specific content
- When building navigation paths to locate notes

### search-notes

Search for notes containing specific text content.

\`\`\`bash
kontexted skill search-notes --alias <profile> --query "<text>" [--limit <n>]
\`\`\`

**Options:**
- \`--alias\` (required): The profile alias to use for authentication
- \`--query\` (required): The search text to find in notes
- \`--limit\` (optional): Maximum number of results to return (default: 10)

**Returns:** JSON array of matching notes with metadata including note ID, title, and relevant snippets

**When to use:**
- When you need to find notes containing specific keywords
- When searching for content across multiple notes
- When the user asks to find notes about a particular topic

### note-by-id

Retrieve the complete content of a specific note by its ID.

\`\`\`bash
kontexted skill note-by-id --alias <profile> --note-id <id>
\`\`\`

**Options:**
- \`--alias\` (required): The profile alias to use for authentication
- \`--note-id\` (required): The unique identifier of the note to retrieve

**Returns:** JSON object containing the full note content including body, metadata, and structure

**When to use:**
- When you have a specific note ID and need its content
- After finding a note via search or workspace tree exploration
- When the user asks to read a specific note

## Typical Workflow

The skill commands work best when combined in a logical sequence:

1. **Explore** - Use \`workspace-tree\` to understand workspace structure
2. **Search** - Use \`search-notes\` to find relevant notes by content
3. **Read** - Use \`note-by-id\` to retrieve full content of specific notes

**Example workflow:**
\`\`\`bash
# First, explore the workspace structure
kontexted skill workspace-tree --alias work

# Then, search for notes containing specific content
kontexted skill search-notes --alias work --query "project planning" --limit 5

# Finally, read the content of notes of interest
kontexted skill note-by-id --alias work --note-id "abc123"
\`\`\`

## Example Usage

### Exploring a workspace

\`\`\`bash
# Get the complete structure of a personal workspace
kontexted skill workspace-tree --alias personal
\`\`\`

### Searching for content

\`\`\`bash
# Find notes about meeting notes
kontexted skill search-notes --alias work --query "meeting notes"

# Limit results to 3 notes
kontexted skill search-notes --alias work --query "todo" --limit 3
\`\`\`

### Reading specific notes

\`\`\`bash
# Get content of a note when you have its ID
kontexted skill note-by-id --alias work --note-id "note-uuid-123"
\`\`\`

### Combining commands in a single task

\`\`\`bash
# Task: Find and read notes about project requirements
# Step 1: Search for relevant notes
kontexted skill search-notes --alias work --query "requirements" --limit 5

# Step 2: Read each matching note
kontexted skill note-by-id --alias work --note-id "req-001"
kontexted skill note-by-id --alias work --note-id "req-002"
\`\`\`

## Error Handling

### Authentication errors

If you encounter authentication errors:

1. **"Profile not found"** - The specified alias doesn't exist. Ask the user to run \`kontexted login --alias <profile>\` first.

2. **"Not authenticated"** - The profile exists but isn't authenticated. Ask the user to re-authenticate with \`kontexted login --alias <profile>\`.

3. **"No workspace configured"** - The profile is authenticated but has no workspace. Ask the user to set up a workspace with \`kontexted workspace set --alias <profile>\`.

### Other errors

- **"Note not found"** - The specified note ID doesn't exist or belongs to a different workspace
- **"Workspace not accessible"** - The workspace exists but the user lacks access permissions
- **"Connection error"** - Network issues. Retry the command or check the user's connection

When errors occur, report them clearly to the user so they can take appropriate action. The kontexted CLI handles most errors with descriptive messages.

## Output Format

All commands return JSON output that is easy to parse:

- \`workspace-tree\`: Returns nested object with folders and notes
- \`search-notes\`: Returns array of matching notes with ID, title, and snippets
- \`note-by-id\`: Returns complete note object with body and metadata

Use this structured output to provide clear responses to users about workspace contents and note information.
