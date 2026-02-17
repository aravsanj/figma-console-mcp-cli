import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { getPlatform, getLocalAppDataPath } from '../utils/platform.js';

export async function runSystemCheck(): Promise<void> {
  console.log(chalk.bold('\n🔍 System Check\n'));

  // Node version check
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (major >= 18) {
    console.log(chalk.green(`  ✓ Node.js ${nodeVersion}`));
  } else {
    console.log(chalk.red(`  ✗ Node.js ${nodeVersion} — version 18+ required`));
    process.exit(1);
  }

  // Figma Desktop check
  const platform = getPlatform();
  let figmaInstalled = false;

  if (platform === 'macos') {
    figmaInstalled = fs.existsSync('/Applications/Figma.app');
  } else if (platform === 'windows') {
    figmaInstalled = fs.existsSync(
      path.join(getLocalAppDataPath(), 'Figma', 'Figma.exe'),
    );
  }

  if (figmaInstalled) {
    console.log(chalk.green('  ✓ Figma Desktop detected'));
  } else {
    console.log(chalk.yellow('  ⚠ Figma Desktop not found — install from https://figma.com/downloads'));
  }
}
