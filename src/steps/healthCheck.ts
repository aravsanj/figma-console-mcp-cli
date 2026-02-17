import chalk from 'chalk';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { confirm, select } from '@inquirer/prompts';
import type { Client } from './clientDetect.js';

const BRIDGE_PORTS = [
  9223, 9224, 9225, 9226, 9227, 9228, 9229, 9230, 9231, 9232,
];

const BRIDGE_TIMEOUT_MS = 60_000;

type BridgeResult = 'connected' | 'timeout' | 'cancelled';

function tryListen(
  server: ReturnType<typeof createServer>,
  port: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => resolve(true));
  });
}

function restoreStdin(): void {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

/**
 * Start a temporary WebSocket server on the first available bridge port,
 * show a cancellable spinner, and wait for the Figma Bridge plugin to connect.
 *
 * Returns "connected" if the plugin connected, "cancelled" if the user pressed
 * Escape, or "timeout" if the timeout expired.
 * If all ports are already in use, assumes healthy (returns "connected").
 */
async function waitForBridgeWithCancel(): Promise<BridgeResult> {
  const server = createServer();
  let bound = false;

  for (const port of BRIDGE_PORTS) {
    bound = await tryListen(server, port);
    if (bound) break;
  }

  if (!bound) {
    return 'connected';
  }

  const spinnerMessage = `Waiting for Bridge plugin... ${chalk.dim('(press Escape to cancel)')}`;

  return new Promise<BridgeResult>((resolve) => {
    let resolved = false;
    const cleanup = (): void => {
      if (resolved) return;
      resolved = true;
      clearInterval(spinnerInterval);
      clearTimeout(timer);
      // Clear spinner line
      process.stdout.write(`\r${' '.repeat(spinnerMessage.length + 6)}\r`);
      server.close();
      restoreStdin();
      process.removeListener('exit', restoreStdin);
    };

    // Spinner
    let frame = 0;
    const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const spinnerInterval = setInterval(() => {
      const f = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!;
      process.stdout.write(`\r  ${chalk.cyan(f)} ${spinnerMessage}`);
      frame++;
    }, 80);

    // Timeout
    const timer = setTimeout(() => {
      cleanup();
      resolve('timeout');
    }, BRIDGE_TIMEOUT_MS);

    // Escape listener
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.on('exit', restoreStdin);

      const onData = (data: string): void => {
        if (data === '\x1b') {
          process.stdin.removeListener('data', onData);
          cleanup();
          resolve('cancelled');
        }
      };
      process.stdin.on('data', onData);

      // Remove data listener when server closes from other paths
      server.on('close', () => {
        process.stdin.removeListener('data', onData);
      });
    }

    // WebSocket upgrade
    server.on('upgrade', (req, socket) => {
      const key = req.headers['sec-websocket-key'];
      if (typeof key === 'string') {
        const accept = createHash('sha1')
          .update(key + '258EAFA5-E914-47DA-95CA-5AB5E34B13E5')
          .digest('base64');
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${accept}\r\n` +
            '\r\n',
        );
      }
      socket.destroy();
      cleanup();
      resolve('connected');
    });
  });
}

async function checkCdp(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('http://localhost:9222', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok || res.status > 0;
  } catch {
    return false;
  }
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  let i = 0;
  const id = setInterval(() => {
    const frame = SPINNER_FRAMES[i % SPINNER_FRAMES.length]!;
    process.stdout.write(`\r  ${chalk.cyan(frame)} ${message}`);
    i++;
  }, 80);

  try {
    const result = await fn();
    process.stdout.write(`\r${' '.repeat(message.length + 6)}\r`);
    return result;
  } finally {
    clearInterval(id);
  }
}

export async function runHealthCheck(
  clients: Client[],
  method: 'bridge' | 'cdp',
): Promise<void> {
  console.log(chalk.bold('\n🏥 Health Check\n'));

  if (method === 'cdp') {
    const ready = await confirm({
      message:
        'Have you relaunched Figma with the --remote-debugging-port flag?',
      default: true,
    });

    if (!ready) {
      console.log(
        chalk.yellow(
          '\n  Complete the setup steps above, then run the wizard again.\n',
        ),
      );
      return;
    }
  }

  let healthy = false;

  while (!healthy) {
    if (method === 'cdp') {
      healthy = await withSpinner('Checking CDP endpoint...', checkCdp);
      if (healthy) {
        console.log(
          chalk.green('  ✓ Figma CDP endpoint reachable (localhost:9222)'),
        );
      } else {
        console.log(
          chalk.yellow(
            '  ⚠ Figma CDP endpoint not reachable — launch Figma with the connection method you chose',
          ),
        );
      }

      if (!healthy) {
        const action = await select({
          message: 'What would you like to do?',
          choices: [
            { name: 'Retry health check', value: 'retry' as const },
            { name: 'Exit setup', value: 'exit' as const },
          ],
        });

        if (action === 'exit') {
          console.log(
            chalk.yellow(
              '\n  Setup incomplete. Run the wizard again when ready.\n',
            ),
          );
          return;
        }
        console.log('');
      }
    } else {
      console.log(
        chalk.cyan(
          '\n  → Start (or restart) the Figma Console Bridge plugin in Figma now.\n',
        ),
      );

      const result = await waitForBridgeWithCancel();

      if (result === 'connected') {
        console.log(chalk.green('  ✓ Bridge plugin connected'));
        healthy = true;
      } else if (result === 'cancelled') {
        console.log(
          chalk.yellow(
            '\n  Setup cancelled. Run the wizard again when ready.\n',
          ),
        );
        return;
      } else {
        console.log(
          chalk.yellow(
            '  ⚠ Bridge plugin not detected — make sure you started/restarted the plugin after seeing this prompt',
          ),
        );

        const action = await select({
          message: 'What would you like to do?',
          choices: [
            { name: 'Retry health check', value: 'retry' as const },
            { name: 'Exit setup', value: 'exit' as const },
          ],
        });

        if (action === 'exit') {
          console.log(
            chalk.yellow(
              '\n  Setup incomplete. Run the wizard again when ready.\n',
            ),
          );
          return;
        }
        console.log('');
      }
    }
  }

  // Success dashboard
  console.log(chalk.bold.green('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.green('  ✅ Setup Complete!'));
  console.log(chalk.bold.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  console.log(chalk.bold('  Configured clients:'));
  for (const c of clients) {
    console.log(chalk.green(`    • ${c.name}`));
  }

  console.log(chalk.bold('\n  Try these prompts in your AI client:\n'));
  console.log(chalk.dim('    "Take a screenshot of the current Figma file"'));
  console.log(chalk.dim('    "List all components in the design system"'));
  console.log(
    chalk.dim('    "Create a 400×300 frame with a blue background"\n'),
  );
}
