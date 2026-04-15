import type { LLMConfig, ToolDefinition } from "@openkrow/ai";

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  llm: LLMConfig;
  maxTurns?: number;
  maxToolCallsPerTurn?: number;
}

export interface Tool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

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

export interface AgentEvents {
  "turn:start": (turn: AgentTurn) => void;
  "turn:end": (turn: AgentTurn) => void;
  "tool:call": (tool: string, args: Record<string, unknown>) => void;
  "tool:result": (tool: string, result: ToolResult) => void;
  "message": (message: AgentMessage) => void;
  "stream:delta": (delta: string) => void;
  "error": (error: Error) => void;
  "done": () => void;
}
