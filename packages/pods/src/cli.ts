#!/usr/bin/env node

/**
 * CLI for managing vLLM deployments on GPU pods.
 */

import { Command } from "commander";
import { PodManager } from "./manager.js";

const program = new Command();
const manager = new PodManager();

program
  .name("krow-pods")
  .description("Manage vLLM deployments on GPU pods")
  .version("0.1.0");

program
  .command("deploy")
  .description("Deploy a vLLM model on a GPU pod")
  .requiredOption("-m, --model <model>", "Model name (e.g., meta-llama/Llama-3-70B)")
  .option("-n, --name <name>", "Deployment name", "default")
  .option("-g, --gpu <type>", "GPU type (A100, H100, A10G, L40S)", "A100")
  .option("-c, --count <count>", "Number of GPUs", "1")
  .action(async (opts) => {
    console.log(`Deploying ${opts.model} on ${opts.count}x ${opts.gpu}...`);
    const deployment = await manager.deploy({
      name: opts.name,
      model: opts.model,
      gpuType: opts.gpu,
      gpuCount: parseInt(opts.count, 10),
    });
    console.log(`Deployment created: ${deployment.id}`);
    console.log(`Status: ${deployment.status.status}`);
  });

program
  .command("list")
  .description("List all active deployments")
  .action(async () => {
    const pods = await manager.list();
    if (pods.length === 0) {
      console.log("No active deployments.");
      return;
    }
    for (const pod of pods) {
      console.log(`  ${pod.id}  ${pod.name}  ${pod.model}  [${pod.status}]`);
    }
  });

program
  .command("destroy <id>")
  .description("Stop and destroy a deployment")
  .action(async (id) => {
    const success = await manager.destroy(id);
    console.log(success ? `Destroyed ${id}` : `Deployment ${id} not found`);
  });

program
  .command("logs <id>")
  .description("View logs for a deployment")
  .action(async (id) => {
    const logs = await manager.logs(id);
    if (logs.length === 0) {
      console.log("No logs found.");
      return;
    }
    for (const line of logs) {
      console.log(line);
    }
  });

program.parse();
