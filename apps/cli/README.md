# Kontexted CLI

The official CLI for Kontexted—provides **Disk Sync**, MCP proxy, server management, and workspace operations for AI-assisted development.

## Installation

```bash
npm install -g kontexted
```

## Overview

Kontexted provides three ways for AI assistants to access your notes:

| Method | Best For | Setup Difficulty |
|--------|----------|------------------|
| **Disk Sync** | Direct file access, all AI tools | ★☆☆ Easy |
| **MCP Server** | Claude Desktop, MCP-compatible tools | ★★☆ Medium |
| **CLI Skills** | Scripted operations, custom workflows | ★★★ Advanced |

---

## Disk Sync (Recommended)

Sync your Kontexted workspace to disk as markdown files. This is the **recommended method** for AI coding agents to access your notes.

### Quick Start

```bash
# In your project directory
kontexted sync init --alias my-workspace --dir .
kontexted sync start --daemon
```

Your notes are now available at `.kontexted/folder/note.md`

### How It Works

- Notes sync to `.kontexted/` as markdown files
- Real-time bidirectional sync with file watching
- Directory is gitignored; `.ignore` file allows AI tools to reference files
- Works with opencode, Claude Code, Cursor, Windsurf, and any AI that reads files

### Commands

| Command | Description |
|---------|-------------|
| `sync init --alias <name> --dir .` | Initialize sync in current directory |
| `sync start --daemon` | Start background sync with file watching |
| `sync start --foreground` | Start sync in foreground |
| `sync stop` | Stop sync daemon |
| `sync status` | Check sync status |
| `sync force-pull` | Pull all notes from server |
| `sync force-push` | Push all local changes to server |
| `sync conflicts list` | List sync conflicts |
| `sync conflicts show <id>` | Show conflict details |
| `sync conflicts resolve <id> --strategy <local\|remote>` | Resolve conflict |
| `sync reset` | Reset sync state |

---

## MCP Proxy

Start the MCP proxy server for Claude Desktop or other MCP clients:

```bash
# Read-only mode
kontexted mcp --alias <name>

# With write access
kontexted mcp --alias <name> --write
```

### Configuring Claude Desktop

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "kontexted": {
      "command": "kontexted",
      "args": ["mcp", "--alias", "my-workspace", "--write"]
    }
  }
}
```

---

## Server Management

Run a local Kontexted server:

```bash
# Initialize local server (first time)
kontexted server init

# Start server in background
kontexted server start

# Start server in foreground
kontexted server start --foreground

# Stop server
kontexted server stop

# Check status
kontexted server status

# View logs
kontexted server logs -f

# Display signup invite code
kontexted server show-invite

# Diagnose issues
kontexted server doctor
```

### Default Configuration

| Setting | Default |
|---------|---------|
| Database | SQLite (`~/.kontexted/data/kontexted.db`) |
| Port | `4729` |
| Config | `~/.kontexted/config.json` |

---

## CLI Skills

Direct CLI access for workspace operations:

```bash
# Query workspace tree
kontexted skill workspace-tree --alias <name>

# Search notes
kontexted skill search-notes --alias <name> --query "search text" --limit 10

# Get note by ID
kontexted skill note-by-id --alias <name> --note-id <id>

# Create folder (requires --write login)
kontexted skill create-folder --alias <name> --name <slug> --display-name "Name"

# Create note (requires --write login)
kontexted skill create-note --alias <name> --name <slug> --title "Title"

# Update note content (requires --write login)
kontexted skill update-note-content --alias <name> --note-id <id> --content "Content"
```

---

## Authentication

```bash
# Login to a server
kontexted login --url https://app.example.com --workspace my-workspace --alias prod

# Login with write permissions
kontexted login --url https://app.example.com --workspace my-workspace --alias prod --write

# Show stored profiles
kontexted show-config

# Remove a profile
kontexted logout --alias prod

# Remove all profiles
kontexted logout
```

---

## Command Reference

| Category | Command | Description |
|----------|---------|-------------|
| **Sync** | `sync init` | Initialize disk sync |
| | `sync start` | Start sync daemon |
| | `sync stop` | Stop sync daemon |
| | `sync status` | Check status |
| | `sync force-pull` | Force pull from server |
| | `sync force-push` | Force push to server |
| | `sync conflicts list` | List conflicts |
| | `sync reset` | Reset sync state |
| **Server** | `server init` | Initialize local server |
| | `server start` | Start server |
| | `server stop` | Stop server |
| | `server status` | Check server status |
| | `server logs` | View logs |
| | `server show-invite` | Display invite code |
| | `server doctor` | Diagnose issues |
| **Auth** | `login` | Authenticate to server |
| | `logout` | Remove stored profile |
| | `show-config` | Display configuration |
| **MCP** | `mcp` | Start MCP proxy |
| **Skills** | `skill workspace-tree` | Get folder structure |
| | `skill search-notes` | Search notes |
| | `skill note-by-id` | Get note by ID |
| | `skill create-folder` | Create folder |
| | `skill create-note` | Create note |
| | `skill update-note-content` | Update note |

---

## Configuration

Profiles are stored in `~/.kontexted/config.json` with OAuth tokens.

---

## Requirements

- Node.js 18 or higher

---

## License

MIT
