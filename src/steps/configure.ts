import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import type { Client } from './clientDetect.js';
import { readJsonConfig, writeJsonConfig, mergeServerConfig } from '../utils/config.js';
import { getPlatform } from '../utils/platform.js';

export async function configureClients(
  clients: Client[],
  token: string,
): Promise<Client[]> {
  console.log(chalk.bold('\n⚙️  Configuring MCP Server\n'));

  const configured: Client[] = [];

  for (const client of clients) {
    try {
      if (client.id === 'claude-code') {
        const ok = await configureClaudeCode(token);
        if (!ok) {
          console.log(chalk.yellow(`  ⊘ ${client.name} skipped`));
          continue;
        }
      } else if (client.configPath) {
        configureJsonClient(client, token);
      }
      configured.push(client);
      console.log(chalk.green(`  ✓ ${client.name} configured`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  ✗ ${client.name} failed: ${message}`));
    }
  }

  return configured;
}

function isClaudeRunning(): boolean {
  try {
    const cmd = getPlatform() === 'windows'
      ? 'tasklist /FI "IMAGENAME eq claude.exe" /NH'
      : 'pgrep -x claude';
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (getPlatform() === 'windows') {
      return output.includes('claude.exe');
    }
    return true; // pgrep exits 0 only if a match is found
  } catch {
    return false; // pgrep exits 1 if no match
  }
}

export function isFigmaConsoleConfigured(): boolean {
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

export async function configureClaudeCode(token: string): Promise<boolean> {
  while (isClaudeRunning()) {
    console.log(chalk.yellow('\n  ⚠ Claude Code appears to be running.'));
    console.log(chalk.yellow('    It holds a lock that prevents `claude mcp add` from succeeding.'));
    console.log(chalk.yellow('    Please quit Claude Code before continuing.\n'));

    const action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'I\'ve closed Claude Code — retry', value: 'retry' as const },
        { name: 'Skip Claude Code setup', value: 'skip' as const },
      ],
    });

    if (action === 'skip') {
      console.log(chalk.dim('  Skipped. You can configure manually later:'));
      console.log(chalk.dim(`  claude mcp add figma-console -s user -e FIGMA_ACCESS_TOKEN=<token> -e ENABLE_MCP_APPS=true -- npx -y figma-console-mcp@latest`));
      return false;
    }
    // action === 'retry' → loop continues, re-checks isClaudeRunning()
  }

  if (isFigmaConsoleConfigured()) {
    execSync('claude mcp remove figma-console -s user', { stdio: 'ignore' });
  }

  execSync(
    `claude mcp add figma-console -s user -e FIGMA_ACCESS_TOKEN=${token} -e ENABLE_MCP_APPS=true -- npx -y figma-console-mcp@latest`,
    { stdio: 'ignore' },
  );
  return true;
}

export function configureJsonClient(client: Client, token: string): void {
  const configPath = client.configPath!;
  const existing = readJsonConfig(configPath);
  const merged = mergeServerConfig(existing, token);
  writeJsonConfig(configPath, merged);
}
