import { execSync } from 'node:child_process';
import { select, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { getClients, type Client } from './clientDetect.js';
import { readJsonConfig, writeJsonConfig, detectInstallMethodFromConfig } from '../utils/config.js';
import {
  configureClaudeCode,
  configureJsonClient,
  isFigmaConsoleConfigured,
} from './configure.js';
import { promptForToken } from './auth.js';
import { selectInstallMethod, type InstallMethod } from './installMethod.js';

interface ScanResult {
  client: Client;
  configured: boolean;
  token: string | null;
}

function maskToken(token: string): string {
  if (token.length <= 9) return token;
  return `${token.slice(0, 5)}****${token.slice(-4)}`;
}

function scanClients(): ScanResult[] {
  const clients = getClients();
  return clients.map((client) => {
    if (client.id === 'claude-code') {
      return {
        client,
        configured: client.detected && isFigmaConsoleConfigured(),
        token: null,
      };
    }

    if (!client.detected || !client.configPath) {
      return { client, configured: false, token: null };
    }

    const config = readJsonConfig(client.configPath);
    const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
    const figmaConsole = mcpServers?.['figma-console'] as Record<string, unknown> | undefined;

    if (!figmaConsole) {
      return { client, configured: false, token: null };
    }

    const env = figmaConsole.env as Record<string, string> | undefined;
    const token = env?.FIGMA_ACCESS_TOKEN ?? null;

    return { client, configured: true, token };
  });
}

function displayResults(results: ScanResult[]): void {
  console.log(chalk.bold('\n  Integration Status:\n'));

  for (const { client, configured, token } of results) {
    if (!client.detected) {
      console.log(chalk.dim(`    · ${client.name.padEnd(20)} not detected`));
    } else if (!configured) {
      console.log(chalk.dim(`    · ${client.name.padEnd(20)} not configured`));
    } else {
      const tokenDisplay =
        client.id === 'claude-code'
          ? 'managed by CLI'
          : token
            ? maskToken(token)
            : 'no token';
      console.log(
        chalk.green(`    ✓ ${client.name.padEnd(20)} configured`) +
          chalk.dim(`   (token: ${tokenDisplay})`),
      );
    }
  }

  console.log('');
}

async function updateToken(results: ScanResult[]): Promise<void> {
  const token = await promptForToken();
  const configured = results.filter((r) => r.configured);

  for (const { client } of configured) {
    try {
      const method: InstallMethod = client.configPath
        ? detectInstallMethodFromConfig(client.configPath)
        : { type: 'npx' };

      if (client.id === 'claude-code') {
        await configureClaudeCode(token, method);
      } else if (client.configPath) {
        configureJsonClient(client, token, method);
      }
      console.log(chalk.green(`  ✓ ${client.name} updated`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  ✗ ${client.name} failed: ${message}`));
    }
  }
}

async function removeIntegrations(results: ScanResult[]): Promise<void> {
  const configured = results.filter((r) => r.configured);

  const toRemove = await checkbox({
    message: 'Select clients to remove integration from:',
    choices: configured.map((r) => ({
      name: r.client.name,
      value: r.client.id,
    })),
  });

  if (toRemove.length === 0) {
    console.log(chalk.dim('  No clients selected.'));
    return;
  }

  for (const id of toRemove) {
    const result = configured.find((r) => r.client.id === id)!;
    try {
      if (id === 'claude-code') {
        execSync('claude mcp remove figma-console -s user', { stdio: 'ignore' });
      } else if (result.client.configPath) {
        const config = readJsonConfig(result.client.configPath);
        const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
        delete mcpServers['figma-console'];
        config.mcpServers = mcpServers;
        writeJsonConfig(result.client.configPath, config);
      }
      console.log(chalk.green(`  ✓ ${result.client.name} removed`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  ✗ ${result.client.name} failed: ${message}`));
    }
  }
}

async function addIntegrations(results: ScanResult[]): Promise<void> {
  const unconfigured = results.filter((r) => r.client.detected && !r.configured);

  const toAdd = await checkbox({
    message: 'Select clients to add integration to:',
    choices: unconfigured.map((r) => ({
      name: r.client.name,
      value: r.client.id,
    })),
  });

  if (toAdd.length === 0) {
    console.log(chalk.dim('  No clients selected.'));
    return;
  }

  const existingToken = results.find((r) => r.token)?.token;
  let token: string;

  if (existingToken) {
    const reuse = await select({
      message: `Use existing token (${maskToken(existingToken)})?`,
      choices: [
        { name: 'Yes, reuse existing token', value: 'reuse' as const },
        { name: 'No, enter a new token', value: 'new' as const },
      ],
    });
    token = reuse === 'reuse' ? existingToken : await promptForToken();
  } else {
    token = await promptForToken();
  }

  const method = await selectInstallMethod();

  for (const id of toAdd) {
    const result = unconfigured.find((r) => r.client.id === id)!;
    try {
      if (id === 'claude-code') {
        await configureClaudeCode(token, method);
      } else if (result.client.configPath) {
        configureJsonClient(result.client, token, method);
      }
      console.log(chalk.green(`  ✓ ${result.client.name} configured`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  ✗ ${result.client.name} failed: ${message}`));
    }
  }
}

export async function runDoctor(): Promise<void> {
  while (true) {
    const results = scanClients();
    displayResults(results);

    const hasConfigured = results.some((r) => r.configured);
    const hasUnconfigured = results.some((r) => r.client.detected && !r.configured);

    type Action = 'update' | 'remove' | 'add' | 'done';
    const choices: { name: string; value: Action }[] = [];

    if (hasConfigured) {
      choices.push({ name: 'Update Figma token', value: 'update' });
      choices.push({ name: 'Remove integration', value: 'remove' });
    }
    if (hasUnconfigured) {
      choices.push({ name: 'Add to unconfigured clients', value: 'add' });
    }
    choices.push({ name: 'Done', value: 'done' });

    const action = await select({ message: 'What would you like to do?', choices });

    if (action === 'done') break;

    if (action === 'update') await updateToken(results);
    else if (action === 'remove') await removeIntegrations(results);
    else if (action === 'add') await addIntegrations(results);
  }
}
