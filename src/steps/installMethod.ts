import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';

const REPO_URL = 'https://github.com/southleft/figma-console-mcp.git';

export type InstallMethod =
  | { type: 'npx' }
  | { type: 'local'; path: string };

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
      { encoding: 'utf-8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const remote = result.stdout?.trim() ?? '';
    return remote.includes('figma-console-mcp');
  } catch {
    return false;
  }
}

function cloneOrUpdateRepo(targetDir: string): void {
  if (isExistingClone(targetDir)) {
    console.log(chalk.dim('  Existing clone detected — pulling latest…'));
    try {
      spawnSync('git', ['-C', targetDir, 'pull'], {
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      // non-fatal — existing clone is still usable
    }
    return;
  }

  if (existsSync(targetDir)) {
    throw new Error(
      `Directory already exists but is not the figma-console-mcp repo: ${targetDir}`,
    );
  }

  console.log(chalk.dim('  Cloning figma-console-mcp…'));
  const result = spawnSync('git', ['clone', REPO_URL, targetDir], {
    encoding: 'utf-8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? 'unknown error';
    throw new Error(`git clone failed: ${stderr}`);
  }
}

function runInstallAndBuild(dir: string): void {
  console.log(chalk.dim('  Installing dependencies…'));
  const install = spawnSync('npm', ['install'], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 120_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (install.status !== 0) {
    const stderr = install.stderr?.trim() ?? 'unknown error';
    throw new Error(`npm install failed: ${stderr}`);
  }

  console.log(chalk.dim('  Building…'));
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (build.status !== 0) {
    const stderr = build.stderr?.trim() ?? 'unknown error';
    throw new Error(`npm run build failed: ${stderr}`);
  }
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

  const defaultRepoPath = path.join(os.homedir(), 'figma-console-mcp');

  let targetDir: string;

  if (isExistingClone(defaultRepoPath)) {
    console.log(chalk.dim(`  Existing clone found at ${defaultRepoPath}`));
    targetDir = defaultRepoPath;
  } else {
    const repoPath = await input({
      message: 'Where should we clone figma-console-mcp?',
      default: defaultRepoPath,
      validate(value: string) {
        if (!path.isAbsolute(value)) {
          return 'Path must be absolute';
        }
        return true;
      },
    });
    targetDir = repoPath.trim();
  }

  cloneOrUpdateRepo(targetDir);
  runInstallAndBuild(targetDir);

  const localJsPath = path.join(targetDir, 'dist', 'local.js');

  if (!existsSync(localJsPath)) {
    throw new Error(
      `Build succeeded but dist/local.js not found at: ${localJsPath}`,
    );
  }

  console.log(chalk.dim(`  Using ${localJsPath}`));

  return { type: 'local', path: localJsPath };
}
