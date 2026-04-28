/**
 * Orchestrator - Central manager for agents and sessions
 *
 * The orchestrator is the core of OpenKrow server, managing:
 * - Agent instances per session
 * - Session and conversation state (via SessionManager)
 * - Configuration via ConfigManager
 *
 * IMPORTANT: The app never reads or writes the database directly.
 * All DB access is delegated to packages: SessionManager, ConfigManager, Agent.
 */

import {
  createDatabaseClient,
  type DatabaseConfig,
} from "@openkrow/database";
import { ConfigManager } from "@openkrow/config";
import { Agent, SessionManager } from "@openkrow/agent";
import { WorkspaceManager } from "@openkrow/workspace";
import type { LLMConfig } from "@openkrow/llm";
import type { Session, Conversation } from "@openkrow/database";

export interface OrchestratorConfig {
  /** Database configuration */
  database?: DatabaseConfig;
  /** Default LLM configuration for agents (used as fallback if ConfigManager has no active model) */
  llm?: LLMConfig;
  /** System prompt override for agents */
  systemPrompt?: string;
  /** Maximum turns per agent run */
  maxTurns?: number;
  /** Workspace directory path */
  workspacePath?: string;
}

/**
 * Orchestrator manages the lifecycle of agents, sessions, and database interactions
 */
export class Orchestrator {
  private sessions: SessionManager;
  private _config: OrchestratorConfig;
  private _configManager: ConfigManager;
  private agents: Map<string, Agent> = new Map();
  /** Active AbortControllers keyed by conversationId — one active request per conversation. */
  private activeRequests: Map<string, AbortController> = new Map();
  private workspace: WorkspaceManager | null = null;

  private constructor(sessions: SessionManager, config: OrchestratorConfig) {
    this.sessions = sessions;
    this._config = config;
    this._configManager = new ConfigManager(sessions.database.settings);

    // Initialize workspace: prefer ConfigManager, fall back to config param
    const wsPath = config.workspacePath ?? this._configManager.getWorkspacePath();
    if (wsPath) {
      this.workspace = new WorkspaceManager();
      this.workspace.init(wsPath);
    }
  }

  /** Get the ConfigManager for reading/writing all configuration. */
  get configManager(): ConfigManager {
    return this._configManager;
  }

  /** Get the SessionManager for session/conversation operations. */
  get sessionManager(): SessionManager {
    return this.sessions;
  }

  /**
   * Create and initialize the orchestrator
   */
  static create(config: OrchestratorConfig): Orchestrator {
    const db = createDatabaseClient(config.database);
    const sessions = new SessionManager(db);
    return new Orchestrator(sessions, config);
  }

  /**
   * Resolve the LLM config for a request.
   * Priority: request overrides → ConfigManager active model → constructor llm param.
   */
  resolveLLMConfig(overrides?: { provider?: string; model?: string }): LLMConfig {
    const active = this._configManager.getActiveModel();
    const provider = (overrides?.provider ?? active.provider) as LLMConfig["provider"];
    const model = overrides?.model ?? active.model;
    const apiKey = this._configManager.resolveApiKey(provider);
    const modelOverrides = this._configManager.getModelOverrides(provider, model);

    return {
      provider,
      model,
      apiKey: apiKey ?? this._config.llm?.apiKey,
      baseUrl: modelOverrides?.baseUrl ?? this._config.llm?.baseUrl,
      maxTokens: modelOverrides?.maxTokens ?? this._config.llm?.maxTokens,
      temperature: modelOverrides?.temperature ?? this._config.llm?.temperature,
    };
  }

  // -----------------------------------------------------------------------
  // Session / Conversation (delegated to SessionManager)
  // -----------------------------------------------------------------------

  getOrCreateSession(workspacePath: string): Session {
    return this.sessions.getOrCreateSession(workspacePath);
  }

  getOrCreateConversation(sessionId: string): Conversation {
    return this.sessions.getOrCreateConversation(sessionId);
  }

  // -----------------------------------------------------------------------
  // Agent management
  // -----------------------------------------------------------------------

  getAgent(sessionId: string, conversationId: string): Agent {
    const key = `${sessionId}:${conversationId}`;
    let agent = this.agents.get(key);

    if (!agent) {
      const systemPrompt = this._config.systemPrompt ?? this._configManager.getSystemPrompt() ?? undefined;

      agent = new Agent({
        name: `openkrow-${sessionId}`,
        description: "OpenKrow AI assistant",
        customPrompt: systemPrompt,
        database: this.sessions.database,
        conversationId,
        ...(this.workspace ? { workspace: this.workspace } : {}),
      });

      this.agents.set(key, agent);
    }

    return agent;
  }

  // -----------------------------------------------------------------------
  // Chat
  // -----------------------------------------------------------------------

  async chat(
    conversationId: string,
    message: string,
    overrides?: { provider?: string; model?: string }
  ): Promise<{ response: string; messageId: string }> {
    const conversation = this.sessions.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const session = this.sessions.getSession(conversation.session_id);
    if (!session) throw new Error(`Session not found: ${conversation.session_id}`);

    const agent = this.getAgent(session.id, conversationId);
    const llmConfig = this.resolveLLMConfig(overrides);
    const maxTurns = this._config.maxTurns ?? this._configManager.getMaxTurns();

    const controller = new AbortController();
    this.activeRequests.set(conversationId, controller);

    try {
      const response = await agent.run(message, {
        llm: llmConfig,
        maxTurns: maxTurns || undefined,
        signal: controller.signal,
      });

      const messages = this.sessions.getLastMessages(conversationId, 1);
      const lastMessage = messages[messages.length - 1];
      this.sessions.touchConversation(conversationId);

      return { response, messageId: lastMessage?.id ?? "" };
    } finally {
      this.activeRequests.delete(conversationId);
    }
  }

  async *streamChat(
    conversationId: string,
    message: string,
    overrides?: { provider?: string; model?: string }
  ): AsyncGenerator<string, { messageId: string }, unknown> {
    const conversation = this.sessions.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const session = this.sessions.getSession(conversation.session_id);
    if (!session) throw new Error(`Session not found: ${conversation.session_id}`);

    const agent = this.getAgent(session.id, conversationId);
    const llmConfig = this.resolveLLMConfig(overrides);
    const maxTurns = this._config.maxTurns ?? this._configManager.getMaxTurns();

    const controller = new AbortController();
    this.activeRequests.set(conversationId, controller);

    try {
      for await (const chunk of agent.stream(message, {
        llm: llmConfig,
        maxTurns: maxTurns || undefined,
        signal: controller.signal,
      })) {
        yield chunk;
      }

      const messages = this.sessions.getLastMessages(conversationId, 1);
      const lastMessage = messages[messages.length - 1];
      this.sessions.touchConversation(conversationId);

      return { messageId: lastMessage?.id ?? "" };
    } finally {
      this.activeRequests.delete(conversationId);
    }
  }

  // -----------------------------------------------------------------------
  // Request cancellation
  // -----------------------------------------------------------------------

  cancelRequest(conversationId: string): boolean {
    const controller = this.activeRequests.get(conversationId);
    if (!controller) return false;
    controller.abort();
    this.activeRequests.delete(conversationId);
    return true;
  }

  // -----------------------------------------------------------------------
  // Queries (delegated to SessionManager)
  // -----------------------------------------------------------------------

  getConversationHistory(conversationId: string, limit?: number) {
    return this.sessions.getConversationHistory(conversationId, limit);
  }

  getRecentConversations(limit?: number) {
    return this.sessions.getRecentConversations(limit);
  }

  getActiveAgentsCount(): number {
    return this.agents.size;
  }

  getWorkspace(): WorkspaceManager | null {
    return this.workspace;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  cleanup(): void {
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();

    for (const [key] of this.agents) {
      const sessionId = key.split(":")[0]!;
      this.sessions.endSession(sessionId);
    }
    this.agents.clear();
  }
}
