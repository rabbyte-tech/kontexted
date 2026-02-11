# Kontexted CLI

A command-line tool for Kontexted that provides MCP proxy functionality and workspace management.

## Installation

```bash
npm install -g kontexted
```

## Usage

### Authentication

Log in to a Kontexted server:

```bash
kontexted login --url https://app.example.com --workspace my-workspace --alias prod
```

With an alias and write permissions:

```bash
kontexted login --url https://app.example.com --workspace my-workspace --alias prod --write
```

### MCP Proxy Mode

Start the MCP proxy server (for use with Claude Desktop or other MCP clients):

```bash
# Using alias
kontexted --alias prod

# Using workspace name
kontexted --workspace my-workspace

# Enable write mode for this session
kontexted --alias prod --write

# Disable write mode for this session
kontexted --alias prod --write-off
```

### Manage Profiles

Show stored profiles:

```bash
kontexted show-config
```

Remove a profile:

```bash
kontexted logout --alias prod
```

Remove all profiles:

```bash
kontexted logout
```

## Configuration

Profiles are stored in `~/.kontexted/profile.json` with OAuth tokens.

## Requirements

- Node.js 18 or higher

## License

MIT
