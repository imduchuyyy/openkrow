import { BrowserView } from "electrobun/bun";
import type { KrowRPCSchema } from "../shared/types";
import { WorkspaceManager } from "./workspace";
import { FileService } from "./files";

/**
 * Creates the RPC handler that bridges the webview and bun process.
 */
export function createRpcHandler(workspace: WorkspaceManager, desktopPath: string) {
  let initPromise: Promise<{ path: string } | { error: string }> | null = null;

  const rpc = BrowserView.defineRPC<KrowRPCSchema>({
    maxRequestTime: 120000,
    handlers: {
      requests: {
        initWorkspace: async () => {
          if (!initPromise) {
            initPromise = (async () => {
              try {
                await workspace.start(desktopPath);
                workspace.startEventStream(rpc.send);
                return { path: desktopPath };
              } catch (err: any) {
                initPromise = null; // allow retry on failure
                return { error: err?.message ?? String(err) };
              }
            })();
          }
          return initPromise;
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
