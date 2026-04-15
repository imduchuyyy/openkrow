import * as readline from "node:readline";
import { Screen, Box, Text, Spinner, Input } from "@openkrow/tui";
import type { CodingAgent } from "./coding-agent.js";

/**
 * Start an interactive terminal session with the coding agent.
 */
export async function startInteractiveSession(
  agent: CodingAgent
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("");
  console.log("  ╭─────────────────────────────────────╮");
  console.log("  │         OpenKrow v0.1.0              │");
  console.log("  │   Terminal Coding Agent              │");
  console.log("  │                                      │");
  console.log("  │   Type your message or /help         │");
  console.log("  │   /quit to exit                      │");
  console.log("  ╰─────────────────────────────────────╯");
  console.log("");

  const prompt = (): void => {
    rl.question("❯ ", async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed === "/quit" || trimmed === "/exit") {
        console.log("\nGoodbye!");
        rl.close();
        process.exit(0);
      }

      if (trimmed === "/help") {
        console.log(`
  Commands:
    /help    - Show this help message
    /quit    - Exit the session
    /clear   - Clear conversation history
    /model   - Show current model info
        `);
        prompt();
        return;
      }

      if (trimmed === "/clear") {
        console.log("  Conversation cleared.\n");
        prompt();
        return;
      }

      try {
        process.stdout.write("\n");
        let fullResponse = "";

        for await (const chunk of agent.stream(trimmed)) {
          process.stdout.write(chunk);
          fullResponse += chunk;
        }

        process.stdout.write("\n\n");
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`\n  Error: ${msg}\n`);
      }

      prompt();
    });
  };

  prompt();
}
