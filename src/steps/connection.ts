import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { input, select } from "@inquirer/prompts";
import chalk from "chalk";
import { getHomedir, getPlatform } from "../utils/platform.js";

const REPO_URL = "https://github.com/southleft/figma-console-mcp.git";
const DEFAULT_CLONE_DIR_NAME = "figma-console-mcp";

export async function setupConnection(): Promise<"bridge" | "cdp"> {
  console.log(chalk.bold("\n🔌 Figma Connection Method\n"));

  const method = await select({
    message: "How do you want to connect to Figma?",
    choices: [
      {
        name: "Desktop Bridge Plugin (Recommended)",
        value: "bridge" as const,
        description: "Install a Figma plugin — no restart needed",
      },
      {
        name: "CDP Debug Mode",
        value: "cdp" as const,
        description: "Relaunch Figma with remote debugging enabled",
      },
    ],
  });

  if (method === "bridge") {
    await setupBridge();
  } else {
    setupCDP();
  }

  return method;
}

function isGitInstalled(): boolean {
  try {
    const result = spawnSync("git", ["--version"], {
      encoding: "utf-8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function isExistingClone(dir: string): boolean {
  return (
    existsSync(join(dir, ".git")) &&
    existsSync(join(dir, "figma-desktop-bridge", "manifest.json"))
  );
}

function cloneOrUpdateRepo(targetDir: string): string {
  const manifestPath = join(
    targetDir,
    "figma-desktop-bridge",
    "manifest.json",
  );

  if (isExistingClone(targetDir)) {
    console.log(chalk.dim("  Existing clone detected — pulling latest…"));
    try {
      spawnSync("git", ["-C", targetDir, "pull"], {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
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

  console.log(chalk.dim("  Cloning figma-console-mcp…"));
  const result = spawnSync("git", ["clone", REPO_URL, targetDir], {
    encoding: "utf-8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? "unknown error";
    throw new Error(`git clone failed: ${stderr}`);
  }

  if (!existsSync(manifestPath)) {
    throw new Error(
      `Clone succeeded but manifest not found at: ${manifestPath}`,
    );
  }

  return manifestPath;
}

function showManualFallback(): void {
  console.log(chalk.yellow("\n  Automatic setup unavailable. Manual steps:\n"));
  console.log(`  1. Clone the repo manually:\n`);
  console.log(chalk.cyan(`     git clone ${REPO_URL}\n`));
  console.log("  2. Open Figma Desktop");
  console.log(
    "  3. Go to Plugins → Development → Import plugin from manifest…",
  );
  console.log(
    "  4. Select: <clone-dir>/figma-desktop-bridge/manifest.json\n",
  );
  console.log(
    "  5. Run the plugin: Plugins → Development → Figma Console Bridge\n",
  );
}

async function setupBridge(): Promise<void> {
  console.log(chalk.bold("\n  Desktop Bridge Setup:\n"));

  if (!isGitInstalled()) {
    console.log(
      chalk.yellow("  git is not installed or not on PATH."),
    );
    showManualFallback();
    return;
  }

  const defaultDir = join(getHomedir(), DEFAULT_CLONE_DIR_NAME);

  const targetDir = await input({
    message: "Where should we clone figma-console-mcp?",
    default: defaultDir,
  });

  let manifestPath: string;
  try {
    manifestPath = cloneOrUpdateRepo(targetDir.trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`\n  Error: ${msg}`));
    showManualFallback();
    return;
  }

  console.log(chalk.bold("\n  Next steps:\n"));
  console.log("  1. Open Figma Desktop");
  console.log(
    "  2. Go to Plugins → Development → Import plugin from manifest…",
  );
  console.log("  3. Select this file:\n");
  console.log(chalk.cyan(`     ${manifestPath}\n`));
  console.log(
    "  4. Run the plugin: Plugins → Development → Figma Console Bridge\n",
  );
}

function setupCDP(): void {
  const platform = getPlatform();

  console.log(chalk.bold("\n  CDP Debug Mode Setup:\n"));

  if (platform === "macos") {
    console.log("  Close Figma if running, then launch with:\n");
    console.log(
      chalk.cyan("    open -a Figma --args --remote-debugging-port=9222\n"),
    );
  } else if (platform === "windows") {
    console.log("  Close Figma if running, then launch with:\n");
    console.log(
      chalk.cyan(
        '    "%LOCALAPPDATA%\\Figma\\Figma.exe" --remote-debugging-port=9222\n',
      ),
    );
  } else {
    console.log("  Close Figma if running, then relaunch with the flag:\n");
    console.log(chalk.cyan("    figma --remote-debugging-port=9222\n"));
  }

  console.log(
    "  Figma must be restarted with this flag each time you want CDP access.",
  );
}
