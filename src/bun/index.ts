import { BrowserWindow, BrowserView, ApplicationMenu, Utils } from "electrobun/bun";
import Electrobun from "electrobun/bun";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import type { KrowRPCSchema, ModelInfo, MessagePart } from "../shared/types";
import { krowAgent } from "./agent";

// Ensure opencode CLI is on PATH and env is correct
const home = homedir();
process.env.PATH = `${join(home, ".opencode/bin")}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ""}`;
process.env.HOME = home;

let client: InstanceType<typeof OpencodeClient> | null = null;
const serverAbort = new AbortController();

// Track which messageIDs belong to assistant messages
const assistantMessageIds = new Set<string>();

async function startEventStream() {
  if (!client) return;
  try {
    const events = await client.event.subscribe();
    for await (const event of (events as any).stream) {
      const evt = event as any;
      switch (evt.type) {
        case "message.updated": {
          const { info } = evt.properties;
          if (info.role === "assistant") {
            assistantMessageIds.add(info.id);
            if (info.time?.completed) {
              rpc.send.messageComplete({
                sessionId: info.sessionID,
                messageId: info.id,
              });
              assistantMessageIds.delete(info.id);
            }
          }
          break;
        }
        case "message.part.updated": {
          const { part, delta } = evt.properties;
          if (!part || !part.type) break;

          // Only forward parts from assistant messages
          if (!assistantMessageIds.has(part.messageID)) break;

          // Map SDK part to our MessagePart type
          let messagePart: MessagePart | null = null;
          switch (part.type) {
            case "text":
              messagePart = { id: part.id, type: "text", sessionID: part.sessionID, messageID: part.messageID, text: part.text ?? "" };
              break;
            case "reasoning":
              messagePart = { id: part.id, type: "reasoning", sessionID: part.sessionID, messageID: part.messageID, text: part.text ?? "" };
              break;
            case "tool":
              messagePart = { id: part.id, type: "tool", sessionID: part.sessionID, messageID: part.messageID, tool: part.tool, state: part.state };
              break;
            case "step-start":
              messagePart = { id: part.id, type: "step-start", sessionID: part.sessionID, messageID: part.messageID };
              break;
            case "step-finish":
              messagePart = { id: part.id, type: "step-finish", sessionID: part.sessionID, messageID: part.messageID, tokens: part.tokens };
              break;
          }

          if (messagePart) {
            rpc.send.partUpdated({
              sessionId: part.sessionID,
              messageId: part.messageID,
              part: messagePart,
              delta: delta ?? undefined,
            });
          }
          break;
        }

        case "session.status": {
          const { sessionID, status } = evt.properties;
          rpc.send.sessionStatus({
            sessionId: sessionID,
            status: status.type,
          });
          break;
        }
        case "session.error": {
          const { sessionID, error } = evt.properties;
          const errorMsg = error?.data?.message ?? error?.name ?? "Unknown error";
          rpc.send.sessionError({
            sessionId: sessionID ?? "",
            error: errorMsg,
          });
          break;
        }
      }
    }
  } catch (err: any) {
    console.error("Event stream error:", err?.message);
  }
}

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
          startEventStream();

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
