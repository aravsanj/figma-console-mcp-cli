import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { getPlatform, getAppDataPath, resolveConfigPath } from '../utils/platform.js';

export interface Client {
  name: string;
  id: string;
  configPath: string | null; // null for Claude Code (uses CLI)
  detected: boolean;
}

function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getClients(): Client[] {
  const platform = getPlatform();
  const appData = getAppDataPath();

  const claudeDesktopPath =
    platform === 'windows'
      ? `${appData}\\Claude\\claude_desktop_config.json`
      : `${appData}/Claude/claude_desktop_config.json`;

  return [
    {
      name: 'Claude Code',
      id: 'claude-code',
      configPath: null,
      detected: isCommandAvailable('claude'),
    },
    {
      name: 'Claude Desktop',
      id: 'claude-desktop',
      configPath: claudeDesktopPath,
      detected: fs.existsSync(claudeDesktopPath),
    },
    {
      name: 'Cursor',
      id: 'cursor',
      configPath: resolveConfigPath('.cursor', 'mcp.json'),
      detected: fs.existsSync(resolveConfigPath('.cursor', 'mcp.json')),
    },
    {
      name: 'Windsurf',
      id: 'windsurf',
      configPath: resolveConfigPath('.codeium', 'windsurf', 'mcp_config.json'),
      detected: fs.existsSync(
        resolveConfigPath('.codeium', 'windsurf', 'mcp_config.json'),
      ),
    },
  ];
}

export async function detectAndSelectClients(): Promise<Client[]> {
  console.log(chalk.bold('\n🔎 Client Detection\n'));

  const clients = getClients();
  const detected = clients.filter((c) => c.detected);
  const notDetected = clients.filter((c) => !c.detected);

  for (const c of detected) {
    console.log(chalk.green(`  ✓ ${c.name} detected`));
  }
  for (const c of notDetected) {
    console.log(chalk.dim(`  · ${c.name} not found`));
  }

  if (detected.length === 0) {
    console.log(chalk.yellow('\n  No supported clients detected.'));
    return [];
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
