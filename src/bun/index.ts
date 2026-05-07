import { BrowserWindow, ApplicationMenu } from "electrobun/bun";
import Electrobun from "electrobun/bun";
import { homedir } from "node:os";
import { join } from "node:path";
import { WorkspaceManager } from "./workspace";
import { createRpcHandler } from "./rpc";

// Ensure opencode CLI is on PATH
const home = homedir();
process.env.PATH = `${join(home, ".opencode/bin")}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ""}`;
process.env.HOME = home;

// Core services
const workspace = new WorkspaceManager();
const rpc = createRpcHandler(workspace);

// Application menu
ApplicationMenu.setApplicationMenu([
  {
    submenu: [{ label: "Quit", role: "quit" }],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
]);

// Main window
const win = new BrowserWindow({
  title: "Krow",
  url: "views://mainview/index.html",
  rpc,
  frame: {
    width: 1400,
    height: 800,
    x: 0,
    y: 0,
  },
});

// Cleanup on exit
const cleanup = () => workspace.stop();

Electrobun.events.on("before-quit", cleanup);
Electrobun.events.on("close", cleanup);
process.on("exit", cleanup);
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("beforeExit", cleanup);
