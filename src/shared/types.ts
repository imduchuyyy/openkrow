/**
 * Krow RPC Schema — defines typed communication between bun process and webview.
 */

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  isLoading?: boolean;
};

export type ModelInfo = {
  id: string;
  name: string;
  providerID: string;
  providerName: string;
};

export type KrowRPCSchema = {
  bun: {
    requests: {
      selectFolder: {
        params: {};
        response: { path: string | null };
      };
      startWorkspace: {
        params: { path: string };
        response: { success: boolean; error?: string };
      };
      createSession: {
        params: {};
        response: { sessionId: string } | { error: string };
      };
      sendMessage: {
        params: { sessionId: string; text: string; model?: { providerID: string; modelID: string } };
        response: { success: boolean } | { error: string };
      };
      getProviders: {
        params: {};
        response: { models: ModelInfo[]; currentModel: string | null } | { error: string };
      };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      workspaceReady: { path: string };
      workspaceError: { error: string };
      streamDelta: { sessionId: string; messageId: string; partId: string; delta: string; text: string };
      streamPartComplete: { sessionId: string; messageId: string; partId: string; type: string; text: string };
      messageComplete: { sessionId: string; messageId: string };
      sessionStatus: { sessionId: string; status: "idle" | "busy" | "retry" };
      sessionError: { sessionId: string; error: string };
    };
  };
};
