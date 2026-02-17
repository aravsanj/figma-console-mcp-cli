import { spawn, type SpawnOptions } from 'node:child_process';
import chalk from 'chalk';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface RunCommandOptions extends SpawnOptions {
  cwd?: string;
  timeout?: number;
  retries?: number;
}

export async function runCommandWithSpinner(
  command: string,
  args: string[],
  spinnerMessage: string,
  options: RunCommandOptions = {},
): Promise<void> {
  const { retries = 0, ...spawnOptions } = options;

  let attempt = 0;

  while (attempt <= retries) {
    try {
      if (attempt > 0) {
        console.log(chalk.yellow(`  ⚠ Retry ${attempt}/${retries}...`));
      }
      await runSingleCommand(command, args, spinnerMessage, spawnOptions);
      return;
    } catch (err) {
      if (attempt === retries) {
        throw err;
      }
      attempt++;
    }
  }
}

function runSingleCommand(
  command: string,
  args: string[],
  spinnerMessage: string,
  options: SpawnOptions & { timeout?: number },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    const spinnerInterval = setInterval(() => {
      const f = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      process.stdout.write(`\r  ${chalk.cyan(f)} ${spinnerMessage}`);
      frame++;
    }, 80);

    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });

    let stderrOutput = '';

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });
    }

    const cleanup = () => {
      clearInterval(spinnerInterval);
      process.stdout.write(`\r${' '.repeat(spinnerMessage.length + 6)}\r`);
    };

    child.on('close', (code) => {
      cleanup();
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`Command failed with code ${code}: ${stderrOutput.trim()}`),
        );
      }
    });

    child.on('error', (err) => {
      cleanup();
      reject(err);
    });

    if (options.timeout) {
      setTimeout(() => {
        child.kill();
        cleanup();
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      }, options.timeout);
    }
  });
}
