# Kontexted

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Status: Alpha](https://img.shields.io/badge/Status-Alpha%2FEarly%20Access-orange.svg)](https://github.com/kontexted/kontexted)

**Collaborative markdown knowledge base for AI-assisted development.**

Kontexted solves the problem of fragmented markdown context files when working with AI coding assistants like opencode, Claude Code, or Codex. Instead of scattering LLM-generated specs, architecture docs, and conditional context files across repositories, Kontexted provides a centralized, searchable, and versioned knowledge base that your entire team can collaborate on.

---

## The Problem

When your team uses AI coding assistants, you often end up with:

- **Scattered context files** - Directories full of LLM-generated specs, architecture docs, and implementation guides
- **Sync issues** - Keeping documentation up-to-date across multiple repositories
- **Collaboration friction** - Team members working on stale versions of specs
- **No enforced standards** - Inconsistent documentation structure across projects
- **Multi-repo chaos** - Missing context when projects span multiple repos
- **Conditional context hell** - Managing files that reference others based on what you want to build

Kontexted centralizes all this knowledge into one place, making it easy to share, maintain, and query via the Model Context Protocol (MCP).

---

## What is Kontexted?

Kontexted is a web-based, real-time collaborative markdown editor designed specifically for managing AI context and project knowledge. It includes:

- **Workspaces & Folders** - Organize notes hierarchically by project or team
- **Real-time Collaboration** - Multiple users can edit simultaneously with CRDT-based conflict resolution
- **MCP Integration** - AI assistants can query your notes directly through the built-in MCP server
- **Version History** - Track every change with revision history and line-by-line blame tracking
- **Secure Authentication** - Email/password with invite codes (optional Keycloak OAuth 2.0)
- **Flexible Database** - SQLite for local/single-user mode, PostgreSQL for multi-user deployments

---

## Features

| Feature | Description |
|---------|-------------|
| **Workspaces** | Isolated environments for different projects or teams |
| **Nested Folders** | Organize notes in hierarchical structures |
| **Real-time Editing** | Collaborate with teammates using Yjs CRDT technology |
| **MCP Server** | Built-in MCP endpoint for AI assistant integration |
| **Version Control** | Complete revision history with author attribution |
| **Blame Tracking** | See who wrote each line and when |
| **Authentication** | Email/password with invite codes (optional Keycloak OAuth 2.0) |
| **Flexible Backend** | SQLite for simple deployments, PostgreSQL for scale |

---

## Quick Start

Get Kontexted running in minutes with Docker Compose.

### Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+

### Start Kontexted (SQLite - Simplest)

```bash
git clone https://github.com/kontexted/kontexted.git
cd kontexted
docker-compose up -d
```

### Start Kontexted (PostgreSQL - Multi-user)

```bash
git clone https://github.com/kontexted/kontexted.git
cd kontexted
docker-compose -f deploy/docker-compose.postgres.yml up -d
```

### Access the Application

| Service | URL |
|---------|-----|
| Webapp | http://localhost:3000 |

### First Steps

1. Sign up at http://localhost:3000 with the invite code (default: `docker-dev` or set via `INVITE_CODE`)
2. Create your first workspace
3. Add folders and notes to document your project
4. Share with team members and start collaborating!

---

## Using Kontexted with AI Assistants

Kontexted includes a built-in MCP (Model Context Protocol) server that allows AI coding assistants to query your notes directly.

The MCP server is available at `http://localhost:3000/mcp` and supports:

- **Tools**: Query and search your knowledge base
- **Resources**: Access notes and workspaces programmatically

Configure your AI assistant to connect to the MCP endpoint for seamless context retrieval.

---

## Deployment Guide

### Docker Deployment

The repository includes multiple Docker Compose configurations:

| File | Purpose |
|------|---------|
| `docker-compose.yml` | SQLite mode (default, simplest) |
| `deploy/docker-compose.sqlite.yml` | SQLite with explicit configuration |
| `deploy/docker-compose.postgres.yml` | PostgreSQL for multi-user deployments |
| `deploy/docker-compose.postgres-keycloak.yml` | PostgreSQL + Keycloak OAuth |

#### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_DIALECT` | Database dialect (`sqlite` or `postgresql`) | `sqlite` |
| `DATABASE_URL` | Database connection string | `./data/kontexted.db` or PostgreSQL connection |
| `AUTH_METHOD` | Authentication method (`email-password` or `keycloak`) | `email-password` |
| `AUTH_KEYCLOAK_ID` | OAuth client ID (Keycloak only) | - |
| `AUTH_KEYCLOAK_SECRET` | OAuth client secret (Keycloak only) | - |
| `AUTH_KEYCLOAK_ISSUER` | Keycloak issuer URL (Keycloak only) | - |
| `BETTER_AUTH_SECRET` | Session encryption secret | Required |
| `BETTER_AUTH_URL` | Base URL for auth callbacks | `http://localhost:3000` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Comma-separated trusted origins | `http://localhost:3000` |
| `INVITE_CODE` | Invite code required for email/password sign-up | Required for email-password |
| `COLLAB_TOKEN_SECRET` | Secret for WebSocket collaboration tokens | Required |
| `PORT` | Server port | `3000` |
| `HOST` | Server bind host | `0.0.0.0` |
| `CORS_ORIGINS` | Comma-separated allowed CORS origins | - |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) | `info` |

**⚠️ Important:** Change all secrets before deploying to production!

#### Production Setup

1. **Update secrets** - Replace all default secrets with cryptographically secure values
   - Set `INVITE_CODE` to a secure code to control who can sign up
   - Update `BETTER_AUTH_SECRET`, `COLLAB_TOKEN_SECRET` to secure random values

2. **For Keycloak OAuth 2.0 (optional):**
   - Configure Keycloak realm and client
   - Set `AUTH_METHOD=keycloak`
   - Update `AUTH_KEYCLOAK_ID`, `AUTH_KEYCLOAK_SECRET`, `AUTH_KEYCLOAK_ISSUER`

3. **Persistent storage** - Ensure database volumes are backed up regularly
4. **HTTPS** - Use a reverse proxy (nginx, Traefik, etc.) with SSL/TLS certificates
5. **Firewall rules** - Restrict access to internal ports

### Manual / Local Development

#### Prerequisites

- [Bun](https://bun.sh/) 1.0+ (for server)
- Node.js 20+ (for client build)
- PostgreSQL 14+ (optional, for PostgreSQL mode)

#### Setup

1. **Clone and install dependencies:**

```bash
git clone https://github.com/kontexted/kontexted.git
cd kontexted
make install
```

2. **Configure environment:**

Copy and configure environment files:

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

5. **Access the application:**

- Client: http://localhost:5173
- Server API: http://localhost:4242

---

## Architecture

Kontexted is organized as a monorepo with the following structure:

```
kontexted/
├── apps/
│   ├── client/          # Vite + React 19 + TypeScript + Tailwind CSS
│   └── server/          # Hono + Bun + TypeScript + Drizzle ORM
├── deploy/              # Docker Compose configurations
│   ├── docker-compose.postgres.yml
│   ├── docker-compose.sqlite.yml
│   └── docker-compose.postgres-keycloak.yml
├── data/                # SQLite database storage (gitignored)
└── Makefile             # Development commands
```

### Components

| Component | Tech Stack | Purpose |
|-----------|------------|---------|
| **Client** | Vite, React 19, TypeScript, Tailwind CSS | UI, markdown editor, real-time collaboration |
| **Server** | Hono, Bun, Drizzle ORM | HTTP API, WebSocket collab, MCP server, auth |
| **Database** | SQLite (local) or PostgreSQL (multi-user) | Persistent data storage |
| **Auth** | Better Auth | Session-based authentication |

### Tech Stack

- **Frontend:**
  - Vite 6
  - React 19
  - TypeScript 5
  - Tailwind CSS 4
  - TanStack Router (file-based routing)
  - TanStack Query (data fetching)
  - Zustand (state management)
  - CodeMirror 6 (markdown editor)
  - Yjs (CRDT for real-time collaboration)
  - shadcn/ui components (Radix UI primitives)

- **Backend:**
  - Hono (web framework)
  - Bun runtime
  - Drizzle ORM
  - Better Auth (authentication)
  - Yjs (WebSocket collaboration)
  - MCP SDK (Model Context Protocol)

- **Infrastructure:**
  - Docker, Docker Compose
  - SQLite or PostgreSQL

---

## Development Commands

Use the Makefile for common development tasks:

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make install` | Install dependencies for client and server |
| `make dev` | Start both client and server in development mode |
| `make dev-client` | Start client only (Vite dev server) |
| `make dev-server` | Start server only (Bun with watch) |
| `make build` | Build both client and server for production |
| `make start` | Start production server |
| `make lint` | Run linter |
| `make db-generate` | Generate database migrations |
| `make db-migrate` | Run database migrations |
| `make db-studio` | Open Drizzle Studio |
| `make docker-build` | Build Docker image |
| `make clean` | Remove build artifacts and node_modules |

---

## License

[MIT License](LICENSE) - Copyright (c) 2026 Rabbyte

---

## Links

- [GitHub Repository](https://github.com/kontexted/kontexted)
- [Issues & Bug Reports](https://github.com/kontexted/kontexted/issues)
