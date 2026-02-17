import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import type { InstallMethod } from './installMethod.js';
import { getHomedir, getPlatform, expandPath } from '../utils/platform.js';
import {
  REPO_URL,
  DEFAULT_CLONE_DIR_NAME,
  MANIFEST_PATH_SUFFIX,
} from '../utils/constants.js';
import { runCommandWithSpinner } from '../utils/process.js';

export async function setupConnection(
  installMethod: InstallMethod,
): Promise<'bridge' | 'cdp'> {
  console.log(chalk.bold('\n🔌 Figma Connection Method\n'));

  const method = await select({
    message: 'How do you want to connect to Figma?',
    choices: [
      {
        name: 'Desktop Bridge Plugin (Recommended)',
        value: 'bridge' as const,
        description: 'Install a Figma plugin — no restart needed',
      },
      {
        name: 'CDP Debug Mode',
        value: 'cdp' as const,
        description: 'Relaunch Figma with remote debugging enabled',
      },
    ],
  });

  if (method === 'bridge') {
    const repoDir =
      installMethod.type === 'local'
        ? dirname(dirname(installMethod.path))
        : undefined;
    await setupBridge(repoDir);
  } else {
    setupCDP();
  }

  return method;
}

function isGitInstalled(): boolean {
  try {
    const result = spawnSync('git', ['--version'], {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function isExistingClone(dir: string): boolean {
  return (
    existsSync(join(dir, '.git')) &&
    existsSync(join(dir, 'figma-desktop-bridge', 'manifest.json'))
  );
}

async function cloneOrUpdateRepo(targetDir: string): Promise<string> {
  const manifestPath = join(targetDir, MANIFEST_PATH_SUFFIX);

  if (isExistingClone(targetDir)) {
    console.log(chalk.dim('  Existing clone detected — pulling latest…'));
    try {
      await runCommandWithSpinner(
        'git',
        ['-C', targetDir, 'pull'],
        'Pulling updates...',
        { timeout: 30_000, stdio: 'ignore' },
      );
    } catch {
      // non-fatal — existing clone is still usable
    }
    return manifestPath;
  }

  if (existsSync(targetDir)) {
    throw new Error(
      `Directory already exists but is not the figma-console-mcp repo: ${targetDir}`,
    );
  }

  console.log(chalk.dim('  Cloning figma-console-mcp…'));

  await runCommandWithSpinner(
    'git',
    ['clone', REPO_URL, targetDir],
    'Cloning repository...',
    { timeout: 60_000 },
  );

  if (!existsSync(manifestPath)) {
    throw new Error(
      `Clone succeeded but manifest not found at: ${manifestPath}`,
    );
  }

  return manifestPath;
}

function showManualFallback(): void {
  console.log(chalk.yellow('\n  Automatic setup unavailable. Manual steps:\n'));
  console.log(`  1. Clone the repo manually:\n`);
  console.log(chalk.cyan(`     git clone ${REPO_URL}\n`));
  console.log('  2. Open Figma Desktop');
  console.log(
    '  3. Go to Plugins → Development → Import plugin from manifest…',
  );
  console.log('  4. Select: <clone-dir>/figma-desktop-bridge/manifest.json\n');
  console.log(
    '  5. Run the plugin: Plugins → Development → Figma Console Bridge\n',
  );
}

async function setupBridge(existingRepoDir?: string): Promise<void> {
  console.log(chalk.bold('\n  Desktop Bridge Setup:\n'));

  let manifestPath: string;

  if (existingRepoDir) {
    manifestPath = join(
      existingRepoDir,
      'figma-desktop-bridge',
      'manifest.json',
    );

    if (!existsSync(manifestPath)) {
      console.log(
        chalk.red(`\n  Error: Bridge manifest not found at: ${manifestPath}`),
      );
      showManualFallback();
      return;
    }
  } else {
    if (!isGitInstalled()) {
      console.log(chalk.yellow('  git is not installed or not on PATH.'));
      showManualFallback();
      return;
    }

    const defaultDir = join(getHomedir(), DEFAULT_CLONE_DIR_NAME);

    const targetDir = await input({
      message: 'Where should we clone figma-console-mcp?',
      default: defaultDir,
    });

    const expandedDir = expandPath(targetDir.trim());

    try {
      manifestPath = await cloneOrUpdateRepo(expandedDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`\n  Error: ${msg}`));
      showManualFallback();
      return;
    }
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

function setupCDP(): void {
  const platform = getPlatform();

  console.log(chalk.bold('\n  CDP Debug Mode Setup:\n'));

  if (platform === 'macos') {
    console.log('  Close Figma if running, then launch with:\n');
    console.log(
      chalk.cyan('    open -a Figma --args --remote-debugging-port=9222\n'),
    );
  } else if (platform === 'windows') {
    console.log('  Close Figma if running, then launch with:\n');
    console.log(
      chalk.cyan(
        '    "%LOCALAPPDATA%\\Figma\\Figma.exe" --remote-debugging-port=9222\n',
      ),
    );
  } else {
    console.log('  Close Figma if running, then relaunch with the flag:\n');
    console.log(chalk.cyan('    figma --remote-debugging-port=9222\n'));
  }

  console.log(
    '  Figma must be restarted with this flag each time you want CDP access.',
  );
}
