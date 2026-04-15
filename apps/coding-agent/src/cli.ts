#!/usr/bin/env node

/**
 * OpenKrow CLI - Interactive terminal coding agent
 */

import { Command } from "commander";
import { CodingAgent } from "./coding-agent.js";
import { startInteractiveSession } from "./session.js";

const program = new Command();

program
  .name("openkrow")
  .description("OpenKrow - Open-source terminal coding agent")
  .version("0.1.0");

program
  .command("chat", { isDefault: true })
  .description("Start an interactive coding session")
  .option("-m, --model <model>", "Model to use", "claude-sonnet-4-20250514")
  .option(
    "-p, --provider <provider>",
    "LLM provider (openai, anthropic, google)",
    "anthropic"
  )
  .option("--system <prompt>", "Custom system prompt")
  .option("--no-tools", "Disable tool use")
  .action(async (opts) => {
    const agent = new CodingAgent({
      provider: opts.provider,
      model: opts.model,
      systemPrompt: opts.system,
      enableTools: opts.tools !== false,
    });

    await startInteractiveSession(agent);
  });

program
  .command("run <prompt>")
  .description("Run a single prompt and exit")
  .option("-m, --model <model>", "Model to use", "claude-sonnet-4-20250514")
  .option("-p, --provider <provider>", "LLM provider", "anthropic")
  .action(async (prompt, opts) => {
    const agent = new CodingAgent({
      provider: opts.provider,
      model: opts.model,
      enableTools: true,
    });

    const response = await agent.run(prompt);
    console.log(response);
  });

program.parse();
