#!/usr/bin/env node

/**
 * Example: TUI Demo
 *
 * Demonstrates the @openkrow/tui components with a small interactive demo.
 * Run with: node --loader ts-node/esm examples/tui-demo.ts
 * Or after build: node examples/tui-demo.js
 */

import { Screen, Box, Text, Spinner, List } from "@openkrow/tui";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const screen = new Screen();

  // Header
  const header = new Box("", { border: "round", borderColor: "#00aaff", bold: true, paddingX: 1 }, "OpenKrow TUI Demo");
  header.setContent("A demonstration of @openkrow/tui components");

  // Status text
  const status = new Text("", { color: "#888888", dim: true });

  // Spinner
  const spinner = new Spinner("Initializing agent...", { color: "#ffcc00" });

  // Feature list
  const featureList = new List(
    [
      "Differential rendering - only redraws changed lines",
      "Box component - borders, padding, titles",
      "Text component - styled terminal text with word wrap",
      "Spinner component - animated loading indicators",
      "List component - selectable item lists",
      "Input component - text input with cursor",
    ],
    { color: "#00cc66" }
  );

  // Add components in order
  screen.add(header);
  screen.add(new Text("")); // spacer
  screen.add(spinner);
  screen.add(new Text("")); // spacer
  screen.add(new Text("Features:", { bold: true, color: "#ffffff" }));
  screen.add(featureList);
  screen.add(new Text("")); // spacer
  screen.add(status);

  // Initial render
  screen.fullRender();

  // Start spinner animation
  spinner.start(() => screen.render());

  // Simulate loading phases
  await sleep(1500);
  spinner.setLabel("Loading providers...");
  status.setContent("  Phase 1/3: Loading LLM providers");
  screen.render();

  await sleep(1500);
  spinner.setLabel("Registering tools...");
  status.setContent("  Phase 2/3: Registering coding tools");
  screen.render();

  await sleep(1500);
  spinner.stop();
  spinner.setLabel("Ready!");
  status.setContent("  Phase 3/3: Complete! Agent is ready.");
  screen.render();

  // Cycle through the list items
  await sleep(800);
  for (let i = 0; i < 6; i++) {
    featureList.selectNext();
    screen.render();
    await sleep(600);
  }

  // Final output
  await sleep(500);
  screen.clear();

  const finalBox = new Box("", {
    border: "double",
    borderColor: "#00cc66",
    paddingX: 2,
    paddingY: 1,
    color: "#ffffff",
  }, "Demo Complete");
  finalBox.setContent(
    "The TUI library is working correctly!\n" +
    "\n" +
    "Components demonstrated:\n" +
    "  - Screen (differential rendering)\n" +
    "  - Box (borders, titles, padding)\n" +
    "  - Text (colors, styles)\n" +
    "  - Spinner (animated loading)\n" +
    "  - List (selectable items)\n" +
    "\n" +
    "Run 'openkrow' to start the coding agent."
  );

  screen.add(finalBox);
  screen.fullRender();

  console.log("\n");
  process.exit(0);
}

main().catch(console.error);
