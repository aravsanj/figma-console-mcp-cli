import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import type { InstallMethod } from './installMethod.js';
import { MANIFEST_PATH_SUFFIX } from '../utils/constants.js';

export async function setupConnection(
  installMethod: InstallMethod,
): Promise<void> {
  console.log(chalk.bold('\n🔌 Figma Connection Method\n'));

  const repoDir =
    installMethod.type === 'local'
      ? dirname(dirname(installMethod.path))
      : undefined;
  await setupBridge(repoDir);
}

async function setupBridge(existingRepoDir?: string): Promise<void> {
  console.log(chalk.bold('\n  Desktop Bridge Setup:\n'));

  let manifestPath: string;

  if (existingRepoDir) {
    manifestPath = join(existingRepoDir, MANIFEST_PATH_SUFFIX);

    if (!existsSync(manifestPath)) {
      console.log(
        chalk.red(`\n  Error: Bridge manifest not found at: ${manifestPath}`),
      );
      return;
    }
  } else {
    console.log(chalk.dim('  Locating plugin path…'));

    const result = spawnSync(
      'npx',
      ['figma-console-mcp@latest', '--print-path'],
      {
        encoding: 'utf-8',
        timeout: 60_000,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      },
    );

    if (result.status !== 0) {
      console.log(
        chalk.red(
          `\n  Error: Failed to run npx figma-console-mcp@latest --print-path`,
        ),
      );
      if (result.stderr) {
        console.log(chalk.red(`  ${result.stderr.trim()}`));
      }
      return;
    }

    console.log(result.stdout);
    return;
  }

  console.log(chalk.bold('\n  Next steps:\n'));
  console.log('  1. Open Figma Desktop');
  console.log(
    '  2. Go to Plugins → Development → Import plugin from manifest…',
  );
  console.log('  3. Select this file:\n');
  console.log(chalk.cyan(`     ${manifestPath}\n`));
  console.log(
    '  4. Run the plugin: Plugins → Development → Figma Console Bridge\n',
  );
}

