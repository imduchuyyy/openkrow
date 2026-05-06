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
        params: { sessionId: string; text: string };
        response: { message: ChatMessage } | { error: string };
      };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      workspaceReady: { path: string };
      workspaceError: { error: string };
    };
  };
};
