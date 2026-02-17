# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An interactive CLI setup wizard (`figma-console-mcp-cli`) that configures the Figma Console MCP server across AI coding clients (Claude Code, Claude Desktop, Cursor, Windsurf). It walks the user through authentication, client detection, MCP config injection, Figma connection setup, and health checks.

## Commands

- `npm run build` — compile TypeScript (`tsc`) to `dist/`
- `npm run dev` — run the CLI directly via `tsx src/index.ts`
- `npm start` — run compiled CLI (`node dist/index.js`)
- `npx tsc --noEmit` — type-check without emitting

There are no tests or linting scripts configured.

## Architecture

The CLI runs a linear wizard defined in `src/index.ts`:

1. **systemCheck** — validates Node >= 18, detects Figma Desktop
2. **auth** — prompts for Figma Personal Access Token (`figd_` prefix)
3. **clientDetect** — detects installed AI clients, user selects which to configure
4. **configure** — injects MCP server config into each client's JSON config file (or runs `claude mcp add` for Claude Code)
5. **connection** — user picks Bridge (plugin) or CDP (debug port), shown setup instructions
6. **healthCheck** — verifies connection works (WebSocket handshake for Bridge on ports 9223–9232, HTTP ping for CDP on port 9222)

### Key directories

- `src/steps/` — each wizard step as a separate module
- `src/utils/platform.ts` — OS detection and platform-specific paths (home dir, AppData, config file locations)
- `src/utils/config.ts` — JSON config read/write/merge utilities

### Client config paths

- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `%APPDATA%\Claude\` (Windows)
- Cursor: `~/.cursor/mcp.json`
- Windsurf: `~/.codeium/windsurf/mcp_config.json`
- Claude Code: configured via `claude mcp add` CLI command (no config file)

## Conventions

- ESM-only (`"type": "module"` in package.json, `"module": "Node16"` in tsconfig)
- Always use `.js` extension in import paths (required for Node16 module resolution)
- Strict TypeScript — no `any` types
- Constants: `UPPER_SNAKE_CASE`; types: `PascalCase`; functions/variables: `camelCase`
- Cross-platform: all file paths and process detection must handle macOS, Windows, and Linux
