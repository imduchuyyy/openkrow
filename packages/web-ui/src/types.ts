/**
 * Types for web UI chat components.
 */

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  toolCalls?: Array<{
    name: string;
    status: "pending" | "running" | "completed" | "error";
    result?: string;
  }>;
}

export interface ChatTheme {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  userBubbleColor: string;
  assistantBubbleColor: string;
  fontFamily: string;
  fontSize: string;
  borderRadius: string;
}
