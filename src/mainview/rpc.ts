import { Electroview } from "electrobun/view";
import type { KrowRPCSchema } from "../shared/types";

// Initialize Electrobun RPC for the webview side
export const rpc = Electroview.defineRPC<KrowRPCSchema>({
  maxRequestTime: 30000,
  handlers: {
    requests: {},
    messages: {
      workspaceReady: (payload) => {
        console.log("Workspace ready:", payload.path);
      },
      workspaceError: (payload) => {
        console.error("Workspace error:", payload.error);
      },
    },
  },
});

export const electrobun = new Electroview({ rpc });
