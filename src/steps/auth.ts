import { password } from '@inquirer/prompts';
import chalk from 'chalk';

export async function promptForToken(): Promise<string> {
  console.log(chalk.bold('\n🔑 Figma Authentication\n'));
  console.log(
    `  Generate a Personal Access Token at:\n  ${chalk.cyan(
      'https://developers.figma.com/docs/rest-api/authentication/#generate-a-personal-access-token',
    )}\n`,
  );

  while (true) {
    const token = await password({
      message:
        'Paste your Figma Personal Access Token (or leave empty to exit):',
      mask: '*',
    });

    if (!token) {
      const error = new Error('Setup cancelled');
      error.name = 'ExitPromptError';
      throw error;
    }

    if (token.startsWith('figd_')) {
      console.log(chalk.green('  ✓ Token accepted'));
      return token;
    }

    console.log(
      chalk.red('  ✗ Invalid token — must start with "figd_". Try again.\n'),
    );
  }
}
