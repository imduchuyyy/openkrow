/**
 * @openkrow/agent-core — Agent runtime with context management,
 * workspace persistence, personality, skills, and tool calling.
 */

// Core runtime
export { Agent } from "./agent.js";
export { ToolRegistry } from "./tools.js";
export { ContextManager } from "./context.js";
export { WorkspaceManager } from "./workspace.js";
export { PersonalityManager } from "./personality.js";
export { SkillManager } from "./skills.js";

// Deprecated — kept for backward compatibility
export { ConversationState } from "./state.js";

// Types
export type {
  // Agent
  AgentConfig,
  AgentEvents,
  AgentMessage,
  AgentTurn,
  AgentState,
  Tool,
  ToolResult,

  // Context
  ContextBudget,
  IContextManager,

  // Workspace
  Workspace,
  WorkspaceContext,
  Memory,
  ConversationSummary,
  PersistedConversation,
  GlobalConversationIndex,
  IWorkspaceManager,

  // Personality
  UserPersonality,
  IPersonalityManager,

  // Skills
  Skill,
  MCPServerConfig,
  ISkillManager,
} from "./types.js";
