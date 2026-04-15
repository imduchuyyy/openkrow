/**
 * @openkrow/agent-core — Type definitions
 *
 * All shared interfaces for the agent runtime: context management,
 * workspace persistence, personality, skills, and the agent itself.
 */

import type { LLMConfig, ToolDefinition, ChatMessage, ModelRoutingConfig } from "@openkrow/ai";

// ---------------------------------------------------------------------------
// Agent Configuration
// ---------------------------------------------------------------------------

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;

  /**
   * LLM configuration — used when no routing config is provided.
   * If `routing` is set, this is ignored in favor of the router.
   */
  llm: LLMConfig;

  /** Smart model routing configuration. */
  routing?: ModelRoutingConfig;

  maxTurns?: number;
  maxToolCallsPerTurn?: number;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface Tool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Messages & Turns
// ---------------------------------------------------------------------------

export interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  toolCallId?: string;
  timestamp: number;
}

export interface AgentTurn {
  id: string;
  messages: AgentMessage[];
  toolCalls: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: ToolResult;
  }>;
  startedAt: number;
  completedAt?: number;
}

export interface AgentState {
  conversationId: string;
  turns: AgentTurn[];
  messages: AgentMessage[];
  isRunning: boolean;
  currentTurn: number;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface AgentEvents {
  "turn:start": (turn: AgentTurn) => void;
  "turn:end": (turn: AgentTurn) => void;
  "tool:call": (tool: string, args: Record<string, unknown>) => void;
  "tool:result": (tool: string, result: ToolResult) => void;
  "message": (message: AgentMessage) => void;
  "stream:delta": (delta: string) => void;
  "error": (error: Error) => void;
  "done": () => void;
  "context:compacted": (summary: string) => void;
  "workspace:initialized": (path: string) => void;
}

// ---------------------------------------------------------------------------
// Context Manager
// ---------------------------------------------------------------------------

export interface ContextBudget {
  /** Max tokens for the entire context window. */
  total: number;
  /** Tokens used by the system prompt section. */
  system: number;
  /** Tokens used by the summary/compaction block. */
  summary: number;
  /** Tokens used by cached/pinned content. */
  cached: number;
  /** Tokens used by active conversation messages. */
  conversation: number;
  /** Tokens used by tool definitions. */
  tools: number;
  /** Remaining tokens available for the response. */
  available: number;
}

export interface IContextManager {
  /** Set the maximum token budget for the context window. */
  setBudget(maxTokens: number): void;

  /** Get current token usage breakdown. */
  getUsage(): ContextBudget;

  /** Build the full message array (budget-aware) for sending to the LLM. */
  buildMessages(): ChatMessage[];

  /** Add a message to the active conversation. */
  addMessage(message: Omit<AgentMessage, "timestamp">): AgentMessage;

  /** Pin content to the cached section (e.g. workspace memories, key files). */
  pinToCache(key: string, content: string): void;

  /** Remove pinned content from cache. */
  unpinFromCache(key: string): void;

  /** Trigger manual compaction (summarize old messages). */
  compact(): Promise<void>;

  /** Inject workspace context and user personality into the system prompt. */
  setSystemContext(context: WorkspaceContext, personality?: UserPersonality): void;

  /** Set the base system prompt. */
  setSystemPrompt(prompt: string): void;

  /** Set tool definitions (for budget tracking). */
  setToolDefinitions(tools: ToolDefinition[]): void;

  /** Get all messages (raw, without system prompt). */
  getMessages(): ReadonlyArray<AgentMessage>;

  /** Get the compaction summary block, if any. */
  getSummary(): string | null;

  /** Reset all state. */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export interface WorkspaceContext {
  projectName: string;
  summary: string;
  techStack: string[];
  conventions: string[];
  keyFiles: string[];
}

export interface Memory {
  id: string;
  content: string;
  source: "agent" | "user";
  createdAt: number;
  tags: string[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  startedAt: number;
  lastActiveAt: number;
  turns: number;
}

export interface Workspace {
  /** Absolute path to the project directory. */
  path: string;
  context: WorkspaceContext;
  memories: Memory[];
  conversations: ConversationSummary[];
}

export interface PersistedConversation {
  id: string;
  title: string;
  workspacePath: string;
  messages: AgentMessage[];
  summaryBlocks: string[];
  memories: Memory[];
  startedAt: number;
  lastActiveAt: number;
  turns: number;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface GlobalConversationIndex {
  conversations: Array<{
    id: string;
    title: string;
    workspacePath: string;
    startedAt: number;
    lastActiveAt: number;
    turns: number;
  }>;
}

export interface IWorkspaceManager {
  /** Initialize a new workspace (creates .krow/ directory). */
  init(dir: string): Promise<Workspace>;

  /** Load an existing workspace from .krow/ directory. */
  load(dir: string): Promise<Workspace>;

  /** Get the workspace context for system prompt injection. */
  getContext(): WorkspaceContext;

  /** Add a memory to the workspace. */
  addMemory(memory: Omit<Memory, "id" | "createdAt">): Promise<Memory>;

  /** Get all memories. */
  getMemories(): Memory[];

  /** List all conversations in the workspace. */
  listConversations(): Promise<ConversationSummary[]>;

  /** Load a specific conversation by ID. */
  loadConversation(id: string): Promise<PersistedConversation>;

  /** Save/update a conversation. */
  saveConversation(conversation: PersistedConversation): Promise<void>;

  /** Get the workspace path, or null if not loaded. */
  getPath(): string | null;

  /** Check if a workspace is loaded. */
  isLoaded(): boolean;
}

// ---------------------------------------------------------------------------
// Personality
// ---------------------------------------------------------------------------

export interface UserPersonality {
  communicationStyle: {
    verbosity: "concise" | "moderate" | "detailed";
    formality: "casual" | "neutral" | "formal";
    explanationDepth: "minimal" | "moderate" | "thorough";
  };
  technical: {
    expertiseLevel: "beginner" | "intermediate" | "advanced" | "expert";
    preferredLanguages: string[];
    preferredTools: string[];
    codingStyle: string[];
  };
  observations: string[];
  lastUpdated: number;
  sessionsAnalyzed: number;
  version: number;
}

export interface IPersonalityManager {
  /** Load personality from disk (~/.config/openkrow/profile/personality.json). */
  load(): Promise<UserPersonality | null>;

  /** Save personality to disk. */
  save(personality: UserPersonality): Promise<void>;

  /** Check if extraction should be triggered (based on session count). */
  shouldExtract(sessionTurns: number): boolean;

  /** Format personality for injection into the system prompt. */
  formatForSystemPrompt(personality: UserPersonality): string;

  /** Get the default/empty personality. */
  getDefault(): UserPersonality;
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface Skill {
  name: string;
  description: string;
  type: "local" | "mcp";
  tools: ToolDefinition[];
  enabled: boolean;
}

export interface MCPServerConfig {
  name: string;
  /** Command to spawn for stdio-based servers. */
  command: string;
  args?: string[];
  /** URL for HTTP-based servers. */
  url?: string;
  env?: Record<string, string>;
}

export interface ISkillManager {
  /** List all installed skills. */
  list(): Skill[];

  /** Install a skill from a source path or URL. */
  install(source: string): Promise<Skill>;

  /** Uninstall a skill by name. */
  uninstall(name: string): Promise<void>;

  /** Connect to an MCP server and register its tools. */
  connectMCP(config: MCPServerConfig): Promise<Skill>;

  /** Get all tool definitions from all enabled skills. */
  getToolDefinitions(): ToolDefinition[];

  /** Execute a skill tool. */
  executeTool(
    skillName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult>;

  /** Shutdown all MCP server connections. */
  shutdown(): Promise<void>;
}
