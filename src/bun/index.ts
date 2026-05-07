import { BrowserWindow, BrowserView, ApplicationMenu, Utils } from "electrobun/bun";
import Electrobun from "electrobun/bun";
import { createOpencode } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import type { KrowRPCSchema, ModelInfo, ChatMessage, MessagePart, FileEntry } from "../shared/types";
import { krowAgent } from "./agent";
import { startEventStream } from "./stream";

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
              agent: {
                krow: krowAgent
              },
              plugin: [],
            },
          });
          client = result.client;

          // Start listening to SSE events and forward to webview
          startEventStream(client, rpc.send);

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
          let sessionId: string;

          // Use existing latest session if available
          const listRes = await client.session.list();
          if (listRes.data && listRes.data.length > 0) {
            const sorted = [...listRes.data].sort((a, b) => b.time.updated - a.time.updated);
            sessionId = sorted[0].id;
          } else {
            const res = await client.session.create({ body: {} });
            if (!res.data) return { error: "Failed to create session" };
            sessionId = res.data.id;
          }

          // Fetch message history
          const history: ChatMessage[] = [];
          const msgRes = await client.session.messages({ path: { id: sessionId } });
          if (msgRes.data) {
            for (const msg of msgRes.data) {
              const { info, parts } = msg;
              if (info.role === "user") {
                const textParts = parts.filter((p: any) => p.type === "text");
                const text = textParts.map((p: any) => p.text).join("");
                history.push({
                  id: info.id,
                  role: "user",
                  text,
                  createdAt: info.time.created,
                });
              } else if (info.role === "assistant") {
                const messageParts: MessagePart[] = [];
                for (const p of parts as any[]) {
                  switch (p.type) {
                    case "text":
                      messageParts.push({ id: p.id, type: "text", sessionID: p.sessionID, messageID: p.messageID, text: p.text ?? "" });
                      break;
                    case "reasoning":
                      messageParts.push({ id: p.id, type: "reasoning", sessionID: p.sessionID, messageID: p.messageID, text: p.text ?? "" });
                      break;
                    case "tool":
                      messageParts.push({ id: p.id, type: "tool", sessionID: p.sessionID, messageID: p.messageID, tool: p.tool, state: p.state });
                      break;
                    case "step-start":
                      messageParts.push({ id: p.id, type: "step-start", sessionID: p.sessionID, messageID: p.messageID });
                      break;
                    case "step-finish":
                      messageParts.push({ id: p.id, type: "step-finish", sessionID: p.sessionID, messageID: p.messageID, tokens: p.tokens });
                      break;
                  }
                }
                const text = messageParts
                  .filter((p) => p.type === "text")
                  .map((p) => (p as any).text)
                  .join("");
                history.push({
                  id: info.id,
                  role: "assistant",
                  text,
                  createdAt: info.time.created,
                  parts: messageParts,
                });
              }
            }
          }

          return { sessionId, history };
        } catch (err: any) {
          return { error: err?.message ?? String(err) };
        }
      },

      sendMessage: async ({ sessionId, text, model }) => {
        if (!client) return { error: "No workspace active" };
        try {
          await client.session.promptAsync({
            path: { id: sessionId },
            body: {
              agent: "krow",
              parts: [{ type: "text", text }],
              model: {
                providerID: "opencode",
                modelID: "big-pickle"
              }
            },
          });
          return { success: true };
        } catch (err: any) {
          return { error: err?.message ?? String(err) };
        }
      },
      getProviders: async () => {
        if (!client) return { error: "No workspace active" };
        try {
          const res = await client.config.providers();
          if (!res.data) return { error: "Failed to fetch providers" };

          const models: ModelInfo[] = [];
          for (const provider of res.data.providers) {
            for (const [modelId, model] of Object.entries(provider.models)) {
              models.push({
                id: modelId,
                name: model.name,
                providerID: provider.id,
                providerName: provider.name,
              });
            }
          }

          // Get current default model (format: "provider/model")
          const defaults = res.data.default;
          const currentModel = defaults?.["default"] ?? null;

          return { models, currentModel };
        } catch (err: any) {
          return { error: err?.message ?? String(err) };
        }
      },

      listFiles: async ({ path: dirPath }) => {
        try {
          const resolved = resolve(dirPath);
          const entries = await readdir(resolved, { withFileTypes: true });
          const files: FileEntry[] = entries
            .filter((e) => !e.name.startsWith("."))
            .sort((a, b) => {
              // Directories first, then alphabetical
              if (a.isDirectory() && !b.isDirectory()) return -1;
              if (!a.isDirectory() && b.isDirectory()) return 1;
              return a.name.localeCompare(b.name);
            })
            .map((e) => ({
              name: e.name,
              path: join(resolved, e.name),
              type: e.isDirectory() ? "directory" as const : "file" as const,
            }));
          return { files };
        } catch (err: any) {
          return { error: err?.message ?? String(err) };
        }
      },

      readFile: async ({ path: filePath }) => {
        try {
          const resolved = resolve(filePath);
          const s = await stat(resolved);
          if (s.size > 1024 * 512) {
            return { error: "File too large (>512KB)" };
          }
          const content = await readFile(resolved, "utf-8");
          return { content, path: resolved };
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
    width: 1400,
    height: 800,
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
