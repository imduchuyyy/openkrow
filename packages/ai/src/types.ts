/**
 * Core types for the unified LLM API.
 */

export interface LLMConfig {
  provider: "openai" | "anthropic" | "google";
  apiKey?: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ChatResponse {
  id: string;
  content: string;
  role: "assistant";
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: "stop" | "tool_calls" | "length" | "error";
}

export interface StreamEvent {
  type: "text_delta" | "tool_call_delta" | "done" | "error";
  delta?: string;
  toolCall?: Partial<ToolCall>;
  response?: ChatResponse;
  error?: Error;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ModelInfo {
  id: string;
  provider: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
}

export interface LLMProvider {
  readonly name: string;

  chat(
    messages: ChatMessage[],
    options?: {
      tools?: ToolDefinition[];
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<ChatResponse>;

  stream(
    messages: ChatMessage[],
    options?: {
      tools?: ToolDefinition[];
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncIterable<StreamEvent>;

  listModels(): Promise<ModelInfo[]>;
}
