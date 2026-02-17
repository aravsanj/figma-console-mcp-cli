#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { runSystemCheck } from "./steps/systemCheck.js";
import { promptForToken } from "./steps/auth.js";
import { detectAndSelectClients } from "./steps/clientDetect.js";
import { configureClients } from "./steps/configure.js";
import { selectInstallMethod } from "./steps/installMethod.js";
import { setupConnection } from "./steps/connection.js";
import { runHealthCheck } from "./steps/healthCheck.js";
import { runDoctor } from "./steps/doctor.js";

const program = new Command();

program
  .name("figma-console-mcp-cli")
  .description("Configure Figma Console MCP across AI coding clients")
  .version("1.0.0")
  .action(async () => {
    console.log(chalk.bold.cyan("\n  Figma Console MCP — Setup Wizard\n"));

    try {
      await runSystemCheck();
      const token = await promptForToken();
      const clients = await detectAndSelectClients();

      if (clients.length === 0) {
        console.log(chalk.yellow("\nNo clients selected. Exiting.\n"));
        return;
      }

      const installMethod = await selectInstallMethod();
      const configured = await configureClients(clients, token, installMethod);

      if (configured.length === 0) {
        console.log(chalk.yellow("\nNo clients were configured. Exiting.\n"));
        return;
      }

      const method = await setupConnection(installMethod);
      await runHealthCheck(configured, method);
    } catch (err) {
      if ((err as { name?: string }).name === "ExitPromptError") {
        console.log(chalk.dim("\nSetup cancelled.\n"));
        return;
      }
      console.error(
        chalk.red(`\nError: ${err instanceof Error ? err.message : err}\n`),
      );
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description("Diagnose and manage Figma Console MCP integrations")
  .action(async () => {
    console.log(chalk.bold.cyan("\n  Figma Console MCP — Doctor\n"));
    try {
      await runDoctor();
    } catch (err) {
      if ((err as { name?: string }).name === "ExitPromptError") {
        console.log(chalk.dim("\nDoctor cancelled.\n"));
        return;
      }
      console.error(
        chalk.red(`\nError: ${err instanceof Error ? err.message : err}\n`),
      );
      process.exit(1);
    }
  });

program.parse();
