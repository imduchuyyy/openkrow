import { BrowserWindow, ApplicationMenu } from "electrobun/bun";
import Electrobun from "electrobun/bun";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { WorkspaceManager } from "./workspace";
import { createRpcHandler } from "./rpc";
import type { Theme } from "../shared/types";

// Ensure opencode CLI is on PATH
const home = homedir();
process.env.PATH = `${join(home, ".opencode/bin")}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ""}`;
process.env.HOME = home;

// Core services
const workspace = new WorkspaceManager();
const desktopPath = join(home, "Desktop");
let appTheme: Theme = "dark";

function setAppTheme(theme: Theme) {
  appTheme = theme;
  rpc.send.themeChanged({ theme });
}

const rpc = createRpcHandler(workspace, desktopPath, {
  getTheme: () => appTheme,
  setTheme: setAppTheme,
});

// Application menu
ApplicationMenu.setApplicationMenu([
  {
    submenu: [
      { label: "About OpenKrow", role: "about" },
      { type: "separator" },
      { label: "Hide OpenKrow", role: "hide" },
      { label: "Hide Others", role: "hideOthers" },
      { label: "Show All", role: "showAll" },
      { type: "separator" },
      { label: "Quit OpenKrow", role: "quit", accelerator: "cmd+q" },
    ],
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
  {
    label: "View",
    submenu: [
      { label: "Toggle Full Screen", role: "toggleFullScreen" },
    ],
  },
  {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { role: "close" },
    ],
  },
]);

// Main window
const win = new BrowserWindow({
  title: "OpenKrow",
  url: "views://mainview/index.html",
  rpc,
  frame: {
    width: 900,
    height: 700,
    x: 0,
    y: 0,
  },
});

// Cleanup on exit
const cleanup = () => workspace.stop();

Electrobun.events.on("before-quit", cleanup);
process.on("exit", cleanup);
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("beforeExit", cleanup);
