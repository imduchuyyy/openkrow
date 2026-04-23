/**
 * Token estimation utilities.
 *
 * Uses a chars/4 heuristic which is fast and reasonably accurate for English text.
 * For code, it slightly overestimates (which is safer — better to compact too early
 * than to overflow the context window).
 */

import type {
  ContentPart,
} from "@openkrow/llm";
import type {
  Message,
  SendableMessage,
  ToolDefinition,
} from "../types/index.js";

/** Estimate tokens from a string using chars/4 heuristic */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Estimate tokens for a ContentPart */
function estimateContentPartTokens(part: ContentPart): number {
  switch (part.type) {
    case "text":
    case "thinking":
      return estimateTokens(part.text);
    case "tool_call":
      // name + JSON args
      return estimateTokens(part.name) + estimateTokens(part.arguments) + 10;
    case "image":
      // Images are typically ~1000 tokens for a medium image
      return 1000;
  }
}

/** Estimate tokens for a single message */
export function estimateMessageTokens(msg: Message): number {
  // Per-message overhead (role, separators, etc.)
  const overhead = 4;

  switch (msg.role) {
    case "user": {
      if (typeof msg.content === "string") {
        return overhead + estimateTokens(msg.content);
      }
      return overhead + msg.content.reduce((sum, p) => sum + estimateContentPartTokens(p), 0);
    }
    case "assistant": {
      return overhead + msg.content.reduce((sum, p) => sum + estimateContentPartTokens(p), 0);
    }
    case "tool": {
      return overhead + estimateTokens(msg.content) + estimateTokens(msg.toolCallId) + 5;
    }
    case "snip":
    case "summary": {
      // Markers are not sent to the LLM; return 0
      return 0;
    }
  }
}

/** Estimate total tokens for a list of sendable messages */
export function estimateTotalTokens(messages: SendableMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

/** Estimate tokens for tool definitions (passed in the system/tools section) */
export function estimateToolDefinitionTokens(tools: ToolDefinition[]): number {
  if (tools.length === 0) return 0;
  // Each tool: name + description + JSON schema
  return tools.reduce((sum, tool) => {
    return sum + estimateTokens(tool.name) + estimateTokens(tool.description) + estimateTokens(JSON.stringify(tool.parameters)) + 10;
  }, 0);
}
