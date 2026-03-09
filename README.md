# Kontexted

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Status: Alpha](https://img.shields.io/badge/Status-Alpha%2FEarly%20Access-orange.svg)](https://github.com/rabbyte-tech/kontexted)

**Collaborative markdown knowledge base for AI-assisted development.**

---

## Introduction

Kontexted solves the problem of fragmented markdown context files when working with AI coding assistants like opencode, Claude Code, or Codex. Instead of scattering LLM-generated specs, architecture docs, and conditional context files across repositories, Kontexted provides a centralized, searchable, and versioned knowledge base that your entire team can collaborate on.

### The Problem

When your team uses AI coding assistants, you often end up with:

- **Scattered context files** - Directories full of LLM-generated specs, architecture docs, and implementation guides
- **Sync issues** - Keeping documentation up-to-date across multiple repositories
- **Collaboration friction** - Team members working on stale versions of specs
- **Multi-repo chaos** - Missing context when projects span multiple repos

### Features

| Feature | Description |
|---------|-------------|
| **Disk Sync** | Sync notes to disk as markdown files for direct AI agent access |
| **Workspaces** | Isolated environments for different projects or teams |
| **Nested Folders** | Organize notes in hierarchical structures |
| **Real-time Collaboration** | Collaborate with teammates using Yjs CRDT technology |
| **MCP Server** | Built-in MCP endpoint for AI assistant integration |
| **Version Control** | Complete revision history with author attribution |
| **Blame Tracking** | See who wrote each line and when |
| **Authentication** | Email/password with invite codes (optional Keycloak OAuth 2.0) |
| **Flexible Backend** | SQLite for simple deployments, PostgreSQL for scale |

---

## Quick Start - Local CLI

Get Kontexted running in minutes with a single command.

### Install

```bash
npm install -g kontexted
```

### Initialize Server

```bash
# Initialize local server (creates config, generates secrets, runs migrations)
kontexted server init

# Start the server
kontexted server start

# Open in browser
open http://localhost:4729
```

> **What does `server init` do?**
> - Creates a configuration file at `~/.kontexted/config.json`
> - Generates secure random secrets for session encryption and collaboration
> - Creates a SQLite database with auto-generated migrations
> - Generates a random invite code for signup

### Default Configuration

| Setting | Default |
|---------|---------|
| Database | SQLite (`~/.kontexted/data/kontexted.db`) |
| Port | `4729` |
| Auth Secret | Auto-generated secure random string |
| Invite Code | Auto-generated random string |

### Get Invite Code

After initialization, you can retrieve the invite code:

```bash
kontexted server show-invite
```

### First Steps

1. Open http://localhost:4729 in your browser
2. Sign up with the invite code from `kontexted server show-invite`
3. Create your first workspace
4. Add folders and notes to document your project

---

## Disk Sync for AI Agents

AI agents work best with direct file access. Kontexted's Disk Sync pulls your notes to disk as markdown files, making them instantly available to any AI coding assistant—opencode, Claude Code, Cursor, Windsurf, and more.

### Why Disk Sync?

- **Direct file access** - AI agents read markdown files natively
- **Real-time sync** - Bidirectional sync keeps everything current
- **File watching** - Changes are synced immediately
- **Works everywhere** - Any AI tool that can read files

### Quick Setup

In your project directory:

```bash
# 1. Login to your workspace (first time only)
kontexted login --url http://localhost:4729 --workspace my-workspace --alias local

# 2. Initialize sync
kontexted sync init --alias local --dir .

# 3. Start sync daemon
kontexted sync start --daemon
```

Your notes are now available at `.kontexted/folder/note.md`

### The .kontexted Directory

```
your-project/
├── .kontexted/           # Synced notes (gitignored)
│   ├── .sync/            # Sync state and config
│   ├── folder/           # Notes organized in folders
│   │   └── note.md
│   └── root-note.md      # Root-level notes
├── .gitignore            # Auto-updated to ignore .kontexted/
└── .ignore               # Negation pattern for AI tools
```

The `.kontexted/` directory is automatically added to `.gitignore`. A `.ignore` file with a negation pattern allows AI tools to reference the files.

### Sync Commands

| Command | Description |
|---------|-------------|
| `kontexted sync init --alias <name> --dir .` | Initialize sync in current directory |
| `kontexted sync start --daemon` | Start background sync with file watching |
| `kontexted sync start --foreground` | Start sync in foreground |
| `kontexted sync stop` | Stop sync daemon |
| `kontexted sync status` | Check sync status |
| `kontexted sync force-pull` | Force pull all notes from server |
| `kontexted sync force-push` | Force push all local changes to server |
| `kontexted sync conflicts list` | List sync conflicts |
| `kontexted sync conflicts show <id>` | Show conflict details |
| `kontexted sync conflicts resolve <id> --strategy <local\|remote>` | Resolve conflict |
| `kontexted sync reset` | Reset sync state |

---

## AI Integration

Kontexted provides three ways for AI assistants to access your notes:

| Method | Best For | Setup Difficulty |
|--------|----------|------------------|
| **Disk Sync** | Direct file access, all AI tools | ★☆☆ Easy |
| **MCP Server** | Claude Desktop, MCP-compatible tools | ★★☆ Medium |
| **CLI Skills** | Scripted operations, custom workflows | ★★★ Advanced |

### 1. Disk Sync (Recommended)

See the [Disk Sync for AI Agents](#disk-sync-for-ai-agents) section above for full details.

### 2. MCP Server

For AI assistants that support the Model Context Protocol:

```bash
# Start MCP proxy (read-only mode)
kontexted mcp --alias <name>

# Start MCP proxy with write access
kontexted mcp --alias <name> --write
```

#### Available MCP Tools

| Tool | Description |
|------|-------------|
| `workspace_tree` | Get the folder and note structure of a workspace |
| `search_notes` | Full-text search across all notes in a workspace |
| `get_note` | Retrieve a specific note by its public ID |
| `create_folder` | Create a new folder (write-enabled profiles only) |
| `create_note` | Create a new note (write-enabled profiles only) |
| `update_note` | Update note content (write-enabled profiles only) |

#### Configuring Claude Desktop

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

### 3. CLI Skills

Direct CLI access for workspace operations:

```bash
# Query workspace tree
kontexted skill workspace-tree --alias <name>

# Search notes
kontexted skill search-notes --alias <name> --query "search text"

# Get note by ID
kontexted skill note-by-id --alias <name> --note-id <id>

# Create folder (requires --write login)
kontexted skill create-folder --alias <name> --name <slug> --display-name "Display Name"

# Create note (requires --write login)
kontexted skill create-note --alias <name> --name <slug> --title "Note Title"

# Update note content (requires --write login)
kontexted skill update-note-content --alias <name> --note-id <id> --content "New content"
```

---

## CLI Commands Reference

### Authentication

```bash
# Authenticate and store a profile
kontexted login --url <server> --workspace <slug> --alias <name>

# Authenticate with write access
kontexted login --url <server> --workspace <slug> --alias <name> --write

# Remove a stored profile
kontexted logout --alias <name>

# Show current configuration
kontexted show-config
```

### Server Management

```bash
# Initialize local server (first time setup)
kontexted server init

# Initialize with interactive customization
kontexted server init --interactive

# Start server in daemon mode (background)
kontexted server start

# Start server in foreground (blocking)
kontexted server start --foreground

# Stop the server
kontexted server stop

# Force stop the server
kontexted server stop --force

# Check server status
kontexted server status

# View server logs
kontexted server logs

# Follow logs in real-time
kontexted server logs -f

# Diagnose issues
kontexted server doctor

# Display signup invite code
kontexted server show-invite

# Run database migrations
kontexted server migrate
```

### Disk Sync

```bash
# Initialize sync in current directory
kontexted sync init --alias <name> --dir .

# Start sync daemon with file watching
kontexted sync start --daemon

# Start sync in foreground
kontexted sync start --foreground

# Stop sync daemon
kontexted sync stop

# Check sync status
kontexted sync status

# Force pull from server
kontexted sync force-pull

# Force push to server
kontexted sync force-push

# Manage conflicts
kontexted sync conflicts list
kontexted sync conflicts show <id>
kontexted sync conflicts resolve <id> --strategy local|remote
```

### AI Agent Skills

```bash
# Initialize skills for an AI agent provider
kontexted skill init --provider opencode

# Query workspace tree
kontexted skill workspace-tree --alias <name>

# Search notes
kontexted skill search-notes --alias <name> --query "search text" --limit 10

# Get note by ID
kontexted skill note-by-id --alias <name> --note-id <id>

# Create folder/note/update content (requires --write login)
kontexted skill create-folder --alias <name> --name <slug> --display-name "Name"
kontexted skill create-note --alias <name> --name <slug> --title "Title"
kontexted skill update-note-content --alias <name> --note-id <id> --content "Content"
```

---

## Local Development

For contributing to Kontexted or running the development version directly.

### Prerequisites

- [Bun](https://bun.sh/) 1.0+ (for server runtime)
- Node.js 20+ (for client build)
- PostgreSQL 14+ (optional, for PostgreSQL mode)

### Setup

1. **Clone and install dependencies:**

```bash
git clone https://github.com/rabbyte-tech/kontexted.git
cd kontexted
make install
```

2. **Configure environment:**

```bash
# Server environment
cp apps/server/.env.example apps/server/.env
# Edit apps/server/.env with your settings
```

For SQLite (default):
```bash
# apps/server/.env
DATABASE_DIALECT=sqlite
DATABASE_URL=./data/kontexted.db
BETTER_AUTH_SECRET=your-secret
BETTER_AUTH_URL=http://localhost:4242
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:5173
INVITE_CODE=dev-code
COLLAB_TOKEN_SECRET=dev-secret
```

For PostgreSQL:
```bash
# Create database first
CREATE DATABASE kontexted;
CREATE USER kontexted WITH PASSWORD 'kontexted';
GRANT ALL PRIVILEGES ON DATABASE kontexted TO kontexted;

# apps/server/.env
DATABASE_DIALECT=postgresql
DATABASE_URL=postgresql://kontexted:kontexted@localhost:5432/kontexted
```

3. **Run database migrations:**

```bash
make db-migrate
```

4. **Start development servers:**

```bash
# Start both client and server
make dev

# Or start individually:
make dev-client  # Terminal 1 - Vite dev server (port 5173)
make dev-server  # Terminal 2 - Bun server (port 4242)
```

### Development Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make install` | Install dependencies |
| `make dev` | Start both client and server in development mode |
| `make dev-client` | Start client only (port 5173) |
| `make dev-server` | Start server only (port 4242) |
| `make build` | Build both client and server for production |
| `make lint` | Run linter |
| `make db-generate` | Generate database migrations |
| `make db-migrate` | Run database migrations |
| `make db-studio` | Open Drizzle Studio |

---

## Production Deployment

Deploy Kontexted with Docker for production use.

### Docker Compose (SQLite - Simplest)

```bash
git clone https://github.com/rabbyte-tech/kontexted.git
cd kontexted
docker compose up -d
```

### Docker Compose (PostgreSQL - Production)

```bash
git clone https://github.com/rabbyte-tech/kontexted.git
cd kontexted
docker compose -f deploy/docker-compose.postgres.yml up -d
```

### Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_DIALECT` | Database dialect (`sqlite` or `postgresql`) | `sqlite` |
| `DATABASE_URL` | Database connection string | `./data/kontexted.db` |
| `AUTH_METHOD` | Auth method (`email-password` or `keycloak`) | `email-password` |
| `BETTER_AUTH_SECRET` | Session encryption secret | Required |
| `BETTER_AUTH_URL` | Base URL for auth callbacks | `http://localhost:3000` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Comma-separated trusted origins | `http://localhost:3000` |
| `INVITE_CODE` | Invite code for sign-up | Required |
| `COLLAB_TOKEN_SECRET` | WebSocket collaboration token secret | Required |
| `PORT` | Server port | `3000` |
| `HOST` | Server bind host | `0.0.0.0` |
| `CORS_ORIGINS` | Comma-separated allowed CORS origins | - |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) | `info` |

### Security Checklist

> **Important:** Before deploying to production:

1. **Change all secrets** - Replace default secrets with cryptographically secure values
2. **Set a secure invite code** - Control who can sign up
3. **Use HTTPS** - Deploy behind a reverse proxy (nginx, Traefik) with SSL/TLS
4. **Firewall rules** - Restrict access to internal ports
5. **Database backups** - Ensure persistent volumes are backed up regularly

---

## Architecture

Kontexted is organized as a monorepo with the following structure:

```
kontexted/
├── apps/
│   ├── client/          # Vite + React 19 + TypeScript + Tailwind CSS
│   ├── server/         # Hono + Bun + TypeScript + Drizzle ORM
│   └── cli/            # Commander-based CLI for sync, MCP proxy, workspace management
├── deploy/              # Docker Compose configurations
├── data/                # SQLite database storage (gitignored)
└── Makefile             # Development commands
```

### Tech Stack

| Component | Tech Stack | Purpose |
|-----------|------------|---------|
| **Client** | Vite, React 19, TypeScript, Tailwind CSS | UI, markdown editor, real-time collaboration |
| **Server** | Hono, Bun, Drizzle ORM | HTTP API, WebSocket collab, MCP server, auth |
| **CLI** | Commander, Bun, chokidar | Disk sync, MCP proxy, workspace management |
| **Database** | SQLite (local) or PostgreSQL (multi-user) | Persistent data storage |
| **Auth** | Better Auth | Session-based authentication |

---

## License

[MIT License](LICENSE) - Copyright (c) 2026 Rabbyte

---

## Links

- [GitHub Repository](https://github.com/rabbyte-tech/kontexted)
- [Issues & Bug Reports](https://github.com/rabbyte-tech/kontexted/issues)
