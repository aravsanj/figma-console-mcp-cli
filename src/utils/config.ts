import fs from 'node:fs';
import path from 'node:path';
import type { InstallMethod } from '../steps/installMethod.js';

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

function getServerCommand(method: InstallMethod): { command: string; args: string[] } {
  if (method.type === 'local') {
    return { command: 'node', args: [method.path] };
  }
  return { command: 'npx', args: ['-y', 'figma-console-mcp@latest'] };
}

export function mergeServerConfig(
  existing: Record<string, unknown>,
  token: string,
  method: InstallMethod = { type: 'npx' },
): Record<string, unknown> {
  const mcpServers = (existing.mcpServers as Record<string, unknown>) || {};
  const { command, args } = getServerCommand(method);
  return {
    ...existing,
    mcpServers: {
      ...mcpServers,
      'figma-console': {
        command,
        args,
        env: {
          FIGMA_ACCESS_TOKEN: token,
          ENABLE_MCP_APPS: 'true',
        },
      },
    },
  };
}

export function detectInstallMethodFromConfig(configPath: string): InstallMethod {
  const config = readJsonConfig(configPath);
  const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
  const figmaConsole = mcpServers?.['figma-console'] as Record<string, unknown> | undefined;

  if (figmaConsole?.command === 'node') {
    const args = figmaConsole.args as string[] | undefined;
    if (args?.[0]) {
      return { type: 'local', path: args[0] };
    }
  }
  return { type: 'npx' };
}
