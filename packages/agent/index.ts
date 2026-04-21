/**
 * @openkrow/agent — Agent runtime with context management,
 * workspace persistence, personality, skills, and tool calling.
 */

// Core runtime
export { Agent } from "./agent/index.js";
export { ToolRegistry } from "./tools/index.js";
export { ContextManager } from "./context/index.js";
export { WorkspaceManager } from "./workspace/index.js";
export { PersonalityManager } from "./personality/index.js";
export { SkillManager } from "./skills/index.js";

// Deprecated — kept for backward compatibility
export { ConversationState } from "./state/index.js";

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
} from "./types/index.js";
