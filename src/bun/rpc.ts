import { BrowserView, Utils } from "electrobun/bun";
import { homedir } from "node:os";
import type { KrowRPCSchema } from "../shared/types";
import { WorkspaceManager } from "./workspace";
import { FileService } from "./files";

const home = homedir();

/**
 * Creates the RPC handler that bridges the webview and bun process.
 */
export function createRpcHandler(workspace: WorkspaceManager) {
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
            await workspace.start(path, rpc.send);
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
          try {
            const sessionId = await workspace.getOrCreateSession();
            const history = await workspace.getSessionHistory(sessionId);
            return { sessionId, history };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        sendMessage: async ({ sessionId, text }) => {
          try {
            await workspace.sendMessage(sessionId, text);
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        getProviders: async () => {
          try {
            return await workspace.getProviders();
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        listFiles: async ({ path }) => {
          try {
            const files = await FileService.listFiles(path);
            return { files };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        readFile: async ({ path }) => {
          try {
            return await FileService.readFile(path);
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },
      },
      messages: {},
    },
  });

  return rpc;
}
