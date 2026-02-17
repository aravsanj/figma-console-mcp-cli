import fs from 'node:fs';
import path from 'node:path';

export function readJsonConfig(filePath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function writeJsonConfig(filePath: string, data: Record<string, unknown>): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function mergeServerConfig(
  existing: Record<string, unknown>,
  token: string,
): Record<string, unknown> {
  const mcpServers = (existing.mcpServers as Record<string, unknown>) || {};
  return {
    ...existing,
    mcpServers: {
      ...mcpServers,
      'figma-console': {
        command: 'npx',
        args: ['-y', 'figma-console-mcp@latest'],
        env: {
          FIGMA_ACCESS_TOKEN: token,
          ENABLE_MCP_APPS: 'true',
        },
      },
    },
  };
}
