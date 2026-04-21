/**
 * @openkrow/agent — Type definitions
 */

export interface AgentConfig {
  name: string;
  systemPrompt?: string;
  maxTurns?: number;
}

export interface Tool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
}

export interface AgentEvents {
  message: (message: Message) => void;
  error: (error: Error) => void;
  done: () => void;
}
