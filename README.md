# Kontexted.ai

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Status: Alpha](https://img.shields.io/badge/Status-Alpha%2FEarly%20Access-orange.svg)](https://github.com/kontexted/kontexted)

| ![img1](https://github.com/user-attachments/assets/23d8af50-5d75-4d45-ab07-c31aa934c9f3) | ![img2](https://github.com/user-attachments/assets/2ae5dcfe-7f67-4ce1-9bb8-e2dd114045df) |
| -- | -- |


**Collaborative markdown knowledge base for AI-assisted development.**

Kontexted solves the problem of fragmented markdown context files when working with AI coding assistants like opencode, Claude Code, or Codex. Instead of scattering LLM-generated specs, architecture docs, and conditional context files across repositories, Kontexted provides a centralized, searchable, and versioned knowledge base that your entire team can collaborate on.

---

## The Problem

When your team uses AI coding assistants, you often end up with:

- **Scattered context files** - `docs/` directories full of LLM-generated specs, architecture docs, and implementation guides
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
- **MCP Integration** - AI assistants can query your notes directly through [kontexted-mcp-cli](https://github.com/kontexted/kontexted-mcp-cli)
- **Version History** - Track every change with revision history and line-by-line blame tracking
- **Secure Authentication** - Email/password with invite codes (optional Keycloak OAuth 2.0)

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

---

## Quick Start

Get Kontexted running in minutes with Docker Compose.

### Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+

### Start Kontexted

```bash
git clone https://github.com/kontexted/kontexted.git
cd kontexted
docker compose up -d
```

### Access the Application

| Service | URL |
|---------|-----|
| Webapp | http://app.localhost |

### First Steps

1. Sign up at http://app.localhost with the invite code set in your environment
2. Create your first workspace
3. Add folders and notes to document your project
4. Share with team members and start collaborating!

**Note:** By default, Kontexted uses email/password authentication with invite codes. Keycloak OAuth 2.0 can be optionally configured for enterprise deployments.

---

## Using Kontexted with AI Assistants

Kontexted provides a built-in MCP (Model Context Protocol) server that allows AI coding assistants to query your notes directly.

For AI assistant integration, use the [kontexted-mcp-cli](https://github.com/kontexted/kontexted-mcp-cli). The CLI handles:

- Profile management for multiple Kontexted instances
- Project-specific configurations
- Connecting AI assistants (opencode, Claude Code, etc.) to your Kontexted server

See the [kontexted-mcp-cli repository](https://github.com/kontexted/kontexted-mcp-cli) for installation and usage instructions.

---

## Deployment Guide

### Docker Deployment

The `docker-compose.yml` includes all required services:

| Service | Purpose |
|---------|---------|
| `postgres` | PostgreSQL database |
| `traefik` | Reverse proxy and load balancer |
| `webapp` | Next.js application |
| `collab` | WebSocket collaboration server |
| `keycloak` | Optional OAuth 2.0 identity provider |

#### Environment Variables

The following environment variables can be configured in `docker-compose.yml`:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://kontexted:kontexted@postgres:5432/kontexted` |
| `AUTH_METHOD` | Authentication method (`email-password` or `keycloak`) | `email-password` (auto-detects if not set) |
| `AUTH_KEYCLOAK_ID` | OAuth client ID (Keycloak only) | `kontexted-webapp` |
| `AUTH_KEYCLOAK_SECRET` | OAuth client secret (Keycloak only) | `kontexted-local-secret` |
| `AUTH_KEYCLOAK_ISSUER` | Keycloak issuer URL (Keycloak only) | `http://keycloak.localhost/realms/kontexted` |
| `BETTER_AUTH_SECRET` | Session encryption secret | `2f9569d6a7081d4fc978afc430d06b80` |
| `BETTER_AUTH_URL` | Base URL for auth callbacks | `http://app.localhost` |
| `INVITE_CODE` | Invite code required for email/password sign-up | Empty (sign-up disabled) |
| `COLLAB_TOKEN_SECRET` | Secret for collab server tokens | `6544c2e89932a0c72daf8c42c30b021e` |
| `COLLAB_URL` | Internal collab server URL | `http://collab:8787` |
| `PUBLIC_COLLAB_URL` | Public collab server URL | `ws://collab.localhost` |

**⚠️ Important:** Change all secrets and passwords before deploying to production!

#### Production Setup

For production deployment:

1. **Update secrets** - Replace all default secrets with cryptographically secure values

    **For email/password authentication (default):**
    - Set `INVITE_CODE` to a secure code to control who can sign up
    - Update `BETTER_AUTH_SECRET`, `COLLAB_TOKEN_SECRET` to cryptographically secure values

    **For Keycloak OAuth 2.0 (optional):**
    - Edit `keycloak/full/kontexted-realm.json` to change default credentials:
      - **OAuth Client Secret** (line 22): Change `"secret": "kontexted-local-secret"` to a secure value
      - **User Passwords** (lines 36, 51): Change `"value": "password"` for users
      - **Admin Password**: Set `KEYCLOAK_ADMIN_PASSWORD` in `docker-compose.yml`
    - Set `AUTH_METHOD=keycloak` in `docker-compose.yml`
    - Update environment variables:
      - `AUTH_KEYCLOAK_SECRET` - Must match the OAuth client secret in realm JSON
      - `COLLAB_TOKEN_SECRET` - Use a cryptographically secure secret
      - `BETTER_AUTH_SECRET` - Use a cryptographically secure secret
    - Restart the Keycloak container: `docker compose restart keycloak`

2. **Enable HTTPS** - Configure Traefik with SSL/TLS certificates
3. **Persistent storage** - Ensure `pgdata` volume is backed up regularly
4. **Keycloak production mode** (if using Keycloak): Set `KC_HOSTNAME_STRICT: true` and use a real domain
5. **Firewall rules** - Restrict database and internal ports

### Manual / Local Development

#### Prerequisites

- Bun 1.0+
- PostgreSQL 14+

#### Setup

1. **Clone and install dependencies:**

```bash
git clone https://github.com/kontexted/kontexted.git
cd kontexted
bun install
```

2. **Configure PostgreSQL:**

Create a database and user:

```sql
CREATE DATABASE kontexted;
CREATE USER kontexted WITH PASSWORD 'kontexted';
GRANT ALL PRIVILEGES ON DATABASE kontexted TO kontexted;
```

3. **Set environment variables:**

Copy `.env.example` files and configure:

```bash
# apps/webapp/.env
DATABASE_URL=postgresql://kontexted:kontexted@localhost:5432/kontexted
BETTER_AUTH_SECRET=change-me
BETTER_AUTH_URL=http://localhost:3000
INVITE_CODE=dev-invite-code
COLLAB_TOKEN_SECRET=dev-secret
COLLAB_URL=http://localhost:8787
PUBLIC_COLLAB_URL=http://localhost:8787

# apps/collab/.env
COLLAB_TOKEN_SECRET=dev-secret
DATABASE_URL=postgresql://kontexted:kontexted@localhost:5432/kontexted
```

**Optional: Configure Keycloak for OAuth 2.0**

To use Keycloak instead of email/password:

```bash
# apps/webapp/.env (add these)
AUTH_METHOD=keycloak
AUTH_KEYCLOAK_ID=kontexted-webapp
AUTH_KEYCLOAK_SECRET=kontexted-local-secret
AUTH_KEYCLOAK_ISSUER=http://localhost:8080/realms/kontexted
```

Import the pre-configured realm from `keycloak/full/kontexted-realm.json` into your Keycloak instance.

5. **Run database migrations:**

```bash
bun run db:migrate
```

6. **Start services:**

```bash
# Terminal 1 - Start webapp
bun run dev:webapp

# Terminal 2 - Start collab server
bun run dev:collab
```

Access the webapp at http://localhost:3000.

---

## Architecture

Kontexted is a monorepo managed by Bun workspaces with the following structure:

```
kontexted/
├── apps/
│   ├── webapp/          # Next.js 16 (React 19, TypeScript)
│   └── collab/         # Bun + Hono (WebSocket server)
└── packages/
    └── kontexted-db/   # Drizzle ORM schema
```

### Components

| Component | Tech Stack | Purpose |
|-----------|------------|---------|
| **Webapp** | Next.js 16, React 19, Tailwind CSS | UI, HTTP API, MCP server |
| **Collab** | Bun, Hono, Yjs | Real-time collaboration via WebSocket |
| **Database** | PostgreSQL, Drizzle ORM | Persistent data storage |
| **Auth** | Better Auth, Keycloak | OAuth 2.0 authentication |
| **Reverse Proxy** | Traefik | Load balancing and routing |

### Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Bun, Hono, Yjs, Better Auth
- **Database:** PostgreSQL, Drizzle ORM
- **Auth:** Better Auth (email/password or optional Keycloak OAuth 2.0)
- **Infrastructure:** Docker, Docker Compose, Traefik

---

## License

[MIT License](LICENSE) - Copyright (c) 2026 Rabbyte

---

## Links

- [GitHub Repository](https://github.com/kontexted/kontexted)
- [Issues & Bug Reports](https://github.com/kontexted/kontexted/issues)
- [kontexted-mcp-cli](https://github.com/kontexted/kontexted-mcp-cli) - AI assistant integration
