import type { SkillDefinition } from '../providers/base';

export const kontextedCliSkill: SkillDefinition = {
  name: 'kontexted-cli',
  description: 'Access and manage Kontexted workspaces, search notes, retrieve content, and create/update notes and folders through the kontexted CLI. Use when the user needs to explore workspace structure, find specific notes, read note content, or modify workspace content using profile aliases.',
  content: String.raw`# Kontexted CLI Skill Commands

## Read Commands (No --write flag needed)

\`\`\`
kontexted skill workspace-tree --alias <profile>                    # Get workspace folder/note structure
kontexted skill search-notes --alias <profile> --query "<text>"    # Search notes
kontexted skill note-by-id --alias <profile> --note-id <id>        # Get specific note
\`\`\`

## Write Commands (Require write-enabled profile)

\`\`\`
kontexted skill create-folder --alias <profile> --name <name> --display-name "<displayName>" [--parent-id <id>]
kontexted skill create-note --alias <profile> --name <name> --title "<title>" [--folder-id <id>] [--content "<content>"]
kontexted skill update-note-content --alias <profile> --note-id <id> --content "<content>"
\`\`\`

## Prerequisites

Before using the kontexted CLI skill commands, ensure:

1. **kontexted CLI is installed** - Install via npm or your preferred package manager
2. **User has authenticated** - User must have run \`kontexted login\` with a profile alias
3. **Profile has a workspace configured** - The profile alias must be associated with an active workspace
4. **Write operations require write-enabled profile** - To use write commands, the profile must have been created with \`kontexted login --write\`

All commands require the \`--alias\` parameter to specify which profile to use. The profile must already be set up and authenticated.

## Available Tools

### Read Tools

#### workspace-tree

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

#### search-notes

Search for notes containing specific text content.

\`\`\`bash
kontexted skill search-notes --alias <profile> --query "<text>" [--limit <n>]
\`\`\`

**Options:**
- \`--alias\` (required): The profile alias to use for authentication
- \`--query\` (required): The search text to find in notes
- \`--limit\` (optional): Maximum number of results to return (default: 20, max: 50)

**Returns:** JSON array of matching notes with metadata including note ID, title, and relevant snippets

**When to use:**
- When you need to find notes containing specific keywords
- When searching for content across multiple notes
- When the user asks to find notes about a particular topic

#### note-by-id

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

### Write Tools

#### create-folder

Create a new folder in the workspace. Optionally nest under a parent folder.

\`\`\`bash
kontexted skill create-folder --alias <profile> --name <name> --display-name "<displayName>" [--parent-id <parentPublicId>]
\`\`\`

**Options:**
- \`--alias\` (required): The profile alias to use for authentication
- \`--name\` (required): URL-safe folder name (kebab-case, camelCase, snake_case, or PascalCase)
- \`--display-name\` (required): Human-readable display name for the folder
- \`--parent-id\` (optional): Public ID of parent folder (omit for root level)

**Returns:** JSON object containing the created folder's public ID and metadata

**When to use:**
- When creating a new folder to organize notes
- When setting up a hierarchical folder structure

**Error cases:**
- **"Folder with this name already exists"** - Choose a different name
- **"Parent folder not found"** - Verify the parent folder ID
- **"Invalid folder name"** - Use kebab-case, camelCase, snake_case, or PascalCase

#### create-note

Create a new note in the workspace. Optionally place in a folder.

\`\`\`bash
kontexted skill create-note --alias <profile> --name <name> --title "<title>" [--folder-id <folderPublicId>] [--content "<content>"]
\`\`\`

**Options:**
- \`--alias\` (required): The profile alias to use for authentication
- \`--name\` (required): URL-safe note name (kebab-case, camelCase, snake_case, or PascalCase)
- \`--title\` (required): Human-readable title for the note
- \`--folder-id\` (optional): Public ID of folder (omit for root level)
- \`--content\` (optional): Initial content for the note (defaults to empty)

**Returns:** JSON object containing the created note's public ID and metadata

**When to use:**
- When creating a new note in the workspace
- When the user asks to write or create a document/note

**Error cases:**
- **"Note with this name already exists"** - Choose a different name
- **"Folder not found"** - Verify the folder ID
- **"Invalid note name"** - Use kebab-case, camelCase, snake_case, or PascalCase

#### update-note-content

Update the content of an existing note. This creates a revision for history.

\`\`\`bash
kontexted skill update-note-content --alias <profile> --note-id <notePublicId> --content "<content>"
\`\`\`

**Options:**
- \`--alias\` (required): The profile alias to use for authentication
- \`--note-id\` (required): Public ID of the note to update
- \`--content\` (required): New content for the note

**Returns:** JSON object containing the note's public ID, revision ID, and updated timestamp

**When to use:**
- When updating the content of an existing note
- When the user asks to edit or modify a note's content
- When appending or replacing note content

**Important notes:**
- This operation replaces the entire note content
- A revision is created for history tracking
- Connected clients are notified in real-time

**Error cases:**
- **"Note not found"** - Verify the note ID
- **"Invalid note public ID"** - Check the ID format

## Typical Workflow

The skill commands work best when combined in a logical sequence:

### Read-Only Workflow

1. **Explore** - Use \`workspace-tree\` to understand workspace structure
2. **Search** - Use \`search-notes\` to find relevant notes by content
3. **Read** - Use \`note-by-id\` to retrieve full content of specific notes

### Write Workflow

1. **Create structure** - Use \`create-folder\` to organize content
2. **Create notes** - Use \`create-note\` to create new notes
3. **Update content** - Use \`update-note-content\` to modify existing notes

**Example write workflow:**
\`\`\`bash
# Create a folder for project documentation
kontexted skill create-folder --alias work --name "project-docs" --display-name "Project Documentation"

# Create a note in that folder (use the returned publicId)
kontexted skill create-note --alias work --name "requirements" --title "Requirements" --folder-id "FOLDER_PUBLIC_ID"

# Update the note content
kontexted skill update-note-content --alias work --note-id "NOTE_PUBLIC_ID" --content "# Requirements\n\n- Feature A\n- Feature B"
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

### Creating a folder structure

\`\`\`bash
# Create a root-level folder
kontexted skill create-folder --alias work --name "meetings" --display-name "Meeting Notes"

# Create a nested folder (use the returned publicId as parent-id)
kontexted skill create-folder --alias work --name "2024" --display-name "2024 Meetings" --parent-id "PARENT_FOLDER_ID"
\`\`\`

### Creating and populating a note

\`\`\`bash
# Create a note with initial content
kontexted skill create-note --alias work --name "todo" --title "Todo List" --content "# Todo\n\n- [ ] Task 1\n- [ ] Task 2"

# Later, update the note content
kontexted skill update-note-content --alias work --note-id "NOTE_ID" --content "# Todo\n\n- [x] Task 1\n- [ ] Task 2\n- [ ] Task 3"
\`\`\`

### Combining read and write operations

\`\`\`bash
# Task: Find a note and update it
# Step 1: Search for the note
kontexted skill search-notes --alias work --query "meeting notes"

# Step 2: Update the found note
kontexted skill update-note-content --alias work --note-id "FOUND_NOTE_ID" --content "Updated content here"
\`\`\`

## Error Handling

### Authentication errors

If you encounter authentication errors:

1. **"Profile not found"** - The specified alias doesn't exist. Ask the user to run \`kontexted login --alias <profile>\` first.

2. **"Not authenticated"** - The profile exists but isn't authenticated. Ask the user to re-authenticate with \`kontexted login --alias <profile>\`.

3. **"No workspace configured"** - The profile is authenticated but has no workspace. Ask the user to set up a workspace with \`kontexted workspace set --alias <profile>\`.

### Write operation errors

1. **"Write operations not enabled for this profile"** - Re-login with \`kontexted login --alias <alias> --write\` to enable write access
2. **"Folder with this name already exists"** - Use a unique name or check existing folders
3. **"Note with this name already exists"** - Use a unique name or check existing notes
4. **"Parent folder not found"** - Verify the parent folder ID exists
5. **"Note not found"** - Verify the note ID is correct

### Other errors

- **"Note not found"** - The specified note ID doesn't exist or belongs to a different workspace
- **"Workspace not accessible"** - The workspace exists but the user lacks access permissions
- **"Connection error"** - Network issues. Retry the command or check the user's connection

When errors occur, report them clearly to the user so they can take appropriate action. The kontexted CLI handles most errors with descriptive messages.

## Output Format

All commands return JSON output that is easy to parse:

### Read commands
- \`workspace-tree\`: Returns nested object with folders and notes
- \`search-notes\`: Returns array of matching notes with ID, title, and snippets
- \`note-by-id\`: Returns complete note object with body and metadata

### Write commands
- \`create-folder\`: Returns \`{ folder: { publicId, name, displayName, parentPublicId } }\`
- \`create-note\`: Returns \`{ note: { publicId, name, title, folderPublicId, content } }\`
- \`update-note-content\`: Returns \`{ note: { publicId, revisionId, updatedAt } }\`

Use this structured output to provide clear responses to users about workspace contents and note information.
`
};
