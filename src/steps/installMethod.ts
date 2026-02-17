import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  REPO_URL,
  DEFAULT_CLONE_DIR_NAME,
  PACKAGE_NAME,
} from '../utils/constants.js';
import { expandPath } from '../utils/platform.js';
import { runCommandWithSpinner } from '../utils/process.js';

export type InstallMethod = { type: 'npx' } | { type: 'local'; path: string };

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
  if (!existsSync(path.join(dir, '.git'))) return false;

  try {
    const result = spawnSync(
      'git',
      ['-C', dir, 'remote', 'get-url', 'origin'],
      {
        encoding: 'utf-8',
        timeout: 5_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    const remote = result.stdout?.trim() ?? '';
    return remote.includes('figma-console-mcp');
  } catch {
    return false;
  }
}

async function cloneOrUpdateRepo(targetDir: string): Promise<void> {
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
    return;
  }

  if (existsSync(targetDir)) {
    throw new Error(
      `Directory already exists but is not the ${PACKAGE_NAME} repo: ${targetDir}`,
    );
  }

  console.log(chalk.dim(`  Cloning ${PACKAGE_NAME}…`));
  await runCommandWithSpinner(
    'git',
    ['clone', REPO_URL, targetDir],
    'Cloning repository...',
    { timeout: 60_000 },
  );
}

async function runInstallAndBuild(dir: string): Promise<void> {
  console.log(chalk.dim('  Installing dependencies…'));
  await runCommandWithSpinner(
    'npm',
    ['install'],
    'Installing dependencies...',
    { cwd: dir, timeout: 120_000 },
  );

  console.log(chalk.dim('  Building…'));
  await runCommandWithSpinner('npm', ['run', 'build'], 'Building project...', {
    cwd: dir,
    timeout: 60_000,
  });
}

export async function selectInstallMethod(): Promise<InstallMethod> {
  const method = await select({
    message: 'How should the MCP server be installed?',
    choices: [
      {
        name: 'NPX (Recommended) — auto-updates',
        value: 'npx' as const,
      },
      {
        name: 'Local Git Clone — for manual update control or contributing',
        value: 'local' as const,
      },
    ],
  });

  if (method === 'npx') {
    return { type: 'npx' };
  }

  if (!isGitInstalled()) {
    throw new Error(
      'git is not installed or not on PATH. Install git and try again.',
    );
  }

  const defaultRepoPath = path.join(os.homedir(), DEFAULT_CLONE_DIR_NAME);

  let targetDir: string;

  if (isExistingClone(defaultRepoPath)) {
    console.log(chalk.dim(`  Existing clone found at ${defaultRepoPath}`));
    targetDir = defaultRepoPath;
  } else {
    const repoPath = await input({
      message: `Where should we clone ${PACKAGE_NAME}?`,
      default: defaultRepoPath,
      validate(value: string) {
        if (!path.isAbsolute(expandPath(value))) {
          return 'Path must be absolute';
        }
        return true;
      },
    });
    targetDir = expandPath(repoPath.trim());
  }

  await cloneOrUpdateRepo(targetDir);
  await runInstallAndBuild(targetDir);

  const localJsPath = path.join(targetDir, 'dist', 'local.js');

  if (!existsSync(localJsPath)) {
    throw new Error(
      `Build succeeded but dist/local.js not found at: ${localJsPath}`,
    );
  }

  console.log(chalk.dim(`  Using ${localJsPath}`));

  return { type: 'local', path: localJsPath };
}
