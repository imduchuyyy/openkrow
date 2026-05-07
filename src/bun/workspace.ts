import { createOpencode } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk";
import type { ChatMessage, MessagePart } from "../shared/types";
import { krowAgent } from "./agent";
import { EventStream, type RpcSend } from "./stream";
import { SkillInstaller } from "./skills";

/**
 * Manages the opencode workspace lifecycle: server, session, and messaging.
 */
export class WorkspaceManager {
  private client: InstanceType<typeof OpencodeClient> | null = null;
  private abortController = new AbortController();
  private eventStream: EventStream | null = null;
  private directory: string | null = null;

  get currentDirectory(): string | null {
    return this.directory;
  }

  get isActive(): boolean {
    return this.client !== null;
  }

  /**
   * Start a workspace: boot opencode server, install skills, begin event stream.
   */
  async start(path: string, send: RpcSend): Promise<void> {
    // Tear down previous workspace if any
    if (this.client) {
      this.stop();
    }

    this.directory = path;
    this.abortController = new AbortController();
    process.chdir(path);

    // Install skills in background
    SkillInstaller.install(path).catch((err: any) => {
      console.error("Failed to setup agent skills:", err?.message);
    });

    const result = await createOpencode({
      port: 4200,
      timeout: 15000,
      signal: this.abortController.signal,
      config: {
        agent: { krow: krowAgent },
        plugin: [],
      },
    });

    this.client = result.client;
    this.eventStream = new EventStream(this.client, send);
    this.eventStream.start();
  }

  /**
   * Stop the current workspace server.
   */
  stop(): void {
    this.abortController.abort();
    this.eventStream = null;
    this.client = null;
    this.directory = null;
  }

  /**
   * Get or create a session for the current workspace directory.
   * Returns the latest existing session or creates a new one.
   */
  async getOrCreateSession(): Promise<string> {
    if (!this.client) throw new Error("No workspace active");

    const listRes = await this.client.session.list({
      query: { directory: this.directory! },
    });

    if (listRes.data && listRes.data.length > 0) {
      const sorted = [...listRes.data].sort((a, b) => b.time.updated - a.time.updated);
      return sorted[0].id;
    }

    const res = await this.client.session.create({ body: {} });
    if (!res.data) throw new Error("Failed to create session");
    return res.data.id;
  }

  /**
   * Fetch full message history for a session.
   */
  async getSessionHistory(sessionId: string): Promise<ChatMessage[]> {
    if (!this.client) throw new Error("No workspace active");

    const history: ChatMessage[] = [];
    const msgRes = await this.client.session.messages({ path: { id: sessionId } });
    if (!msgRes.data) return history;

    for (const msg of msgRes.data) {
      const { info, parts } = msg;

      if (info.role === "user") {
        const text = parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
        history.push({ id: info.id, role: "user", text, createdAt: info.time.created });
      } else if (info.role === "assistant") {
        const messageParts = WorkspaceManager.mapParts(parts);
        const text = messageParts
          .filter((p) => p.type === "text")
          .map((p) => (p as any).text)
          .join("");
        history.push({ id: info.id, role: "assistant", text, createdAt: info.time.created, parts: messageParts });
      }
    }

    return history;
  }

  /**
   * Send a message to a session.
   */
  async sendMessage(sessionId: string, text: string): Promise<void> {
    if (!this.client) throw new Error("No workspace active");

    await this.client.session.promptAsync({
      path: { id: sessionId },
      body: {
        agent: "krow",
        parts: [{ type: "text", text }],
        model: { providerID: "opencode", modelID: "big-pickle" },
      },
    });
  }

  /**
   * Get available providers and models.
   */
  async getProviders(): Promise<{ models: { id: string; name: string; providerID: string; providerName: string }[]; currentModel: string | null }> {
    if (!this.client) throw new Error("No workspace active");

    const res = await this.client.config.providers();
    if (!res.data) throw new Error("Failed to fetch providers");

    const models: { id: string; name: string; providerID: string; providerName: string }[] = [];
    for (const provider of res.data.providers) {
      for (const [modelId, model] of Object.entries(provider.models)) {
        models.push({ id: modelId, name: model.name, providerID: provider.id, providerName: provider.name });
      }
    }

    const currentModel = res.data.default?.["default"] ?? null;
    return { models, currentModel };
  }

  /**
   * Map raw SDK parts to our MessagePart type.
   */
  static mapParts(parts: any[]): MessagePart[] {
    const result: MessagePart[] = [];
    for (const p of parts) {
      switch (p.type) {
        case "text":
          result.push({ id: p.id, type: "text", sessionID: p.sessionID, messageID: p.messageID, text: p.text ?? "" });
          break;
        case "reasoning":
          result.push({ id: p.id, type: "reasoning", sessionID: p.sessionID, messageID: p.messageID, text: p.text ?? "" });
          break;
        case "tool":
          result.push({ id: p.id, type: "tool", sessionID: p.sessionID, messageID: p.messageID, tool: p.tool, state: p.state });
          break;
        case "step-start":
          result.push({ id: p.id, type: "step-start", sessionID: p.sessionID, messageID: p.messageID });
          break;
        case "step-finish":
          result.push({ id: p.id, type: "step-finish", sessionID: p.sessionID, messageID: p.messageID, tokens: p.tokens });
          break;
      }
    }
    return result;
  }
}
