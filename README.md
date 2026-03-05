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

# View last 100 lines
kontexted server logs -n 100

# Diagnose issues
kontexted server doctor

# Display signup invite code
kontexted server show-invite

# Run database migrations
kontexted server migrate
```

### MCP Proxy (for AI Assistants)

```bash
# Start MCP proxy (read-only mode)
kontexted mcp --alias <name>

# Start MCP proxy with write access
kontexted mcp --alias <name> --write
```

### AI Agent Skills

```bash
# Initialize skills for an AI agent provider
kontexted skill init --provider opencode
kontexted skill init --provider opencode --all

# Query workspace tree
kontexted skill workspace-tree --alias <name>

# Search notes
kontexted skill search-notes --alias <name> --query "search text"
kontexted skill search-notes --alias <name> --query "text" --limit 10

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

## AI Assistant Integration

Kontexted includes a built-in MCP (Model Context Protocol) server that allows AI coding assistants to query your notes directly.

### What is MCP?

The Model Context Protocol is an open standard that enables AI assistants to interact with external tools and resources. Kontexted exposes your workspace as MCP tools and resources.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `workspace_tree` | Get the folder and note structure of a workspace |
| `search_notes` | Full-text search across all notes in a workspace |
| `get_note` | Retrieve a specific note by its public ID |
| `create_folder` | Create a new folder (write-enabled profiles only) |
| `create_note` | Create a new note (write-enabled profiles only) |
| `update_note` | Update note content (write-enabled profiles only) |

### Configuring Claude Desktop

Add Kontexted to your Claude Desktop configuration:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "kontexted": {
      "command": "kontexted",
      "args": ["mcp", "--alias", "my-workspace"]
    }
  }
}
```

For write access:

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

### Connecting to a Remote Server

To connect to a hosted Kontexted instance:

```bash
# Login to the remote server
kontexted login --url https://app.example.com --workspace my-workspace --alias work

# Start MCP proxy
kontexted mcp --alias work
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

### Docker Compose Configurations

| File | Purpose |
|------|---------|
| `docker-compose.yml` | SQLite mode (default, simplest) |
| `deploy/docker-compose.sqlite.yml` | SQLite with explicit configuration |
| `deploy/docker-compose.postgres.yml` | PostgreSQL for multi-user deployments |
| `deploy/docker-compose.postgres-keycloak.yml` | PostgreSQL + Keycloak OAuth |

### Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_DIALECT` | Database dialect (`sqlite` or `postgresql`) | `sqlite` |
| `DATABASE_URL` | Database connection string | `./data/kontexted.db` |
| `AUTH_METHOD` | Auth method (`email-password` or `keycloak`) | `email-password` |
| `AUTH_KEYCLOAK_ID` | OAuth client ID (Keycloak only) | - |
| `AUTH_KEYCLOAK_SECRET` | OAuth client secret (Keycloak only) | - |
| `AUTH_KEYCLOAK_ISSUER` | Keycloak issuer URL (Keycloak only) | - |
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

### Optional: Keycloak OAuth 2.0

For enterprise SSO:

1. Configure Keycloak realm and client
2. Set `AUTH_METHOD=keycloak`
3. Update `AUTH_KEYCLOAK_ID`, `AUTH_KEYCLOAK_SECRET`, `AUTH_KEYCLOAK_ISSUER`

---

## Architecture

Kontexted is organized as a monorepo with the following structure:

```
kontexted/
├── apps/
│   ├── client/          # Vite + React 19 + TypeScript + Tailwind CSS
│   ├── server/         # Hono + Bun + TypeScript + Drizzle ORM
│   └── cli/            # Commander-based CLI for MCP proxy
├── deploy/              # Docker Compose configurations
├── data/                # SQLite database storage (gitignored)
└── Makefile             # Development commands
```

### Tech Stack

| Component | Tech Stack | Purpose |
|-----------|------------|---------|
| **Client** | Vite, React 19, TypeScript, Tailwind CSS | UI, markdown editor, real-time collaboration |
| **Server** | Hono, Bun, Drizzle ORM | HTTP API, WebSocket collab, MCP server, auth |
| **CLI** | Commander, Bun | MCP proxy, workspace management |
| **Database** | SQLite (local) or PostgreSQL (multi-user) | Persistent data storage |
| **Auth** | Better Auth | Session-based authentication |

### Technology Details

**Frontend:**
- Vite 6, React 19, TypeScript 5, Tailwind CSS 4
- TanStack Router (file-based routing)
- TanStack Query (data fetching)
- Zustand (state management)
- CodeMirror 6 (markdown editor)
- Yjs (CRDT for real-time collaboration)
- shadcn/ui components (Radix UI primitives)

**Backend:**
- Hono (web framework)
- Bun runtime
- Drizzle ORM
- Better Auth (authentication)
- Yjs (WebSocket collaboration)
- MCP SDK (Model Context Protocol)

**Infrastructure:**
- Docker, Docker Compose
- SQLite or PostgreSQL

---

## License

[MIT License](LICENSE) - Copyright (c) 2026 Rabbyte

---

## Links

- [GitHub Repository](https://github.com/rabbyte-tech/kontexted)
- [Issues & Bug Reports](https://github.com/rabbyte-tech/kontexted/issues)
