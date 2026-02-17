import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { getPlatform, getAppDataPath, resolveConfigPath } from '../utils/platform.js';
import { readJsonConfig } from '../utils/config.js';

export interface Client {
  name: string;
  id: string;
  configPath: string | null; // null for Claude Code (uses CLI)
  detected: boolean;
  configured: boolean;
}

function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isJsonClientConfigured(configPath: string): boolean {
  const config = readJsonConfig(configPath);
  const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
  return mcpServers?.['figma-console'] !== undefined;
}

function isClaudeCodeConfigured(): boolean {
  try {
    const output = execSync('claude mcp list', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.includes('figma-console');
  } catch {
    return false;
  }
}

export function getClients(): Client[] {
  const platform = getPlatform();
  const appData = getAppDataPath();

  const claudeDesktopPath =
    platform === 'windows'
      ? `${appData}\\Claude\\claude_desktop_config.json`
      : `${appData}/Claude/claude_desktop_config.json`;

  const cursorPath = resolveConfigPath('.cursor', 'mcp.json');
  const windsurfPath = resolveConfigPath('.codeium', 'windsurf', 'mcp_config.json');

  const claudeCodeDetected = isCommandAvailable('claude');

  return [
    {
      name: 'Claude Code',
      id: 'claude-code',
      configPath: null,
      detected: claudeCodeDetected,
      configured: claudeCodeDetected && isClaudeCodeConfigured(),
    },
    {
      name: 'Claude Desktop',
      id: 'claude-desktop',
      configPath: claudeDesktopPath,
      detected: fs.existsSync(claudeDesktopPath),
      configured: fs.existsSync(claudeDesktopPath) && isJsonClientConfigured(claudeDesktopPath),
    },
    {
      name: 'Cursor',
      id: 'cursor',
      configPath: cursorPath,
      detected: fs.existsSync(cursorPath),
      configured: fs.existsSync(cursorPath) && isJsonClientConfigured(cursorPath),
    },
    {
      name: 'Windsurf',
      id: 'windsurf',
      configPath: windsurfPath,
      detected: fs.existsSync(windsurfPath),
      configured: fs.existsSync(windsurfPath) && isJsonClientConfigured(windsurfPath),
    },
  ];
}

export async function detectAndSelectClients(): Promise<Client[]> {
  console.log(chalk.bold('\n🔎 Client Detection\n'));

  const clients = getClients();
  const detected = clients.filter((c) => c.detected);
  const notDetected = clients.filter((c) => !c.detected);

  for (const c of detected) {
    const tag = c.configured ? chalk.cyan(' (already configured)') : '';
    console.log(chalk.green(`  ✓ ${c.name} detected`) + tag);
  }
  for (const c of notDetected) {
    console.log(chalk.dim(`  · ${c.name} not found`));
  }

  if (detected.length === 0) {
    console.log(chalk.yellow('\n  No supported clients detected.'));
    return [];
  }

  const hasConfigured = detected.some((c) => c.configured);
  if (hasConfigured) {
    console.log(
      chalk.dim('\n  Tip: To update your Figma token or remove the integration from configured'),
    );
    console.log(
      chalk.dim('  clients, quit and run: ') + chalk.cyan('npx figma-console-mcp-cli doctor'),
    );
  }

  console.log('');

  const selected = await checkbox({
    message: 'Select clients to configure:',
    choices: detected.map((c) => ({
      name: c.name,
      value: c.id,
      checked: true,
    })),
  });

  return detected.filter((c) => selected.includes(c.id));
}
