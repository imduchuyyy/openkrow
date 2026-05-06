import { BrowserWindow, BrowserView, ApplicationMenu, Utils } from "electrobun/bun";
import Electrobun from "electrobun/bun";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import type { KrowRPCSchema, ChatMessage } from "../shared/types";

// Ensure opencode CLI is on PATH and env is correct
const home = homedir();
process.env.PATH = `${join(home, ".opencode/bin")}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ""}`;
process.env.HOME = home;

let client: InstanceType<typeof OpencodeClient> | null = null;
const serverAbort = new AbortController();

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

// Define RPC handlers for webview communication
const rpc = BrowserView.defineRPC<KrowRPCSchema>({
  maxRequestTime: 120000,
  handlers: {
    requests: {
      selectFolder: async () => {
        const paths = await Utils.openFileDialog({
          startingFolder: home,
          canChooseFiles: false,
          canChooseDirectory: true,
          allowsMultipleSelection: false,
        });
        const selected = paths[0] && paths[0] !== "" ? paths[0] : null;
        return { path: selected };
      },

      startWorkspace: async ({ path }) => {
        try {
          process.chdir(path);
          const result = await createOpencode({
            port: 4200,
            timeout: 15000,
            signal: serverAbort.signal,
            config: {
              plugin: [],
            },
          });
          client = result.client;

          const agents = await client.app.agents();
          if (!agents.data) {
            return { success: false, error: "Failed to fetch agents" };
          }
          console.log("Krow server ready at:", path);
          console.log("Agents:", agents.data.map((a) => a.name).join(", "));

          rpc.send.workspaceReady({ path });
          return { success: true };
        } catch (err: any) {
          console.error("Error starting workspace:", err);
          const error = err?.message ?? String(err);
          rpc.send.workspaceError({ error });
          return { success: false, error };
        }
      },

      createSession: async () => {
        if (!client) return { error: "No workspace active" };
        try {
          const res = await client.session.create({ body: {} });
          if (!res.data) return { error: "Failed to create session" };
          return { sessionId: res.data.id };
        } catch (err: any) {
          return { error: err?.message ?? String(err) };
        }
      },

      sendMessage: async ({ sessionId, text }) => {
        if (!client) return { error: "No workspace active" };
        try {
          const res = await client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [{ type: "text", text }],
            },
          });
          if (!res.data) return { error: "No response from server" };

          // Extract text from response parts
          const responseText = res.data.parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("\n");

          const message: ChatMessage = {
            id: res.data.info.id,
            role: "assistant",
            text: responseText,
            createdAt: res.data.info.time.created,
          };
          return { message };
        } catch (err: any) {
          return { error: err?.message ?? String(err) };
        }
      },
    },
    messages: {},
  },
});

const url = "views://mainview/index.html";

const win = new BrowserWindow({
  title: "Krow",
  url,
  rpc,
  frame: {
    width: 600,
    height: 600,
    x: 0,
    y: 0,
  },
});

// Kill OpenCode server when app closes
const cleanup = () => {
  serverAbort.abort();
};

Electrobun.events.on('before-quit', (event) => {
  cleanup();
});

Electrobun.events.on("close", cleanup);
process.on("exit", cleanup);
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("beforeExit", cleanup);
