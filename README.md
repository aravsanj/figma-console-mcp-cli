# figma-console-mcp-cli

Interactive CLI wizard that configures the [Figma Console MCP](https://github.com/southleft/figma-console-mcp) server across AI coding clients.

## Quick Start

```bash
npx figma-console-mcp-cli
```

## What It Does

The wizard walks you through:

1. **System check** — validates Node >= 18 and detects Figma Desktop
2. **Authentication** — prompts for your Figma Personal Access Token
3. **Client detection** — finds installed AI clients and lets you pick which to configure
4. **Configuration** — injects the MCP server config into each client
5. **Connection setup** — choose Bridge (plugin) or CDP (debug port) and get setup instructions
6. **Health check** — verifies the connection to Figma is working

## Supported Clients

- Claude Code
- Claude Desktop
- Cursor
- Windsurf

## Connection Methods

- **Desktop Bridge Plugin** (recommended) — install a Figma plugin, no restart needed
- **CDP Debug Mode** — relaunch Figma with remote debugging enabled on port 9222

## Requirements

- Node.js >= 18
- Figma Desktop (for connection setup)
- A [Figma Personal Access Token](https://www.figma.com/developers/api#access-tokens)

## Development

```bash
# Install dependencies
npm install

# Run the CLI in dev mode
npm run dev

# Build
npm run build

# Run compiled CLI
npm start
```

## License

MIT
