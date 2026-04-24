/**
 * Message conversion between agent and LLM message types.
 *
 * The agent's message types have `timestamp` fields and richer discriminated
 * unions (SnipMarker, SummaryBoundary) that don't exist in the LLM package.
 * These helpers bridge the gap.
 */

import type {
  Message as LLMMessage,
  UserMessage as LLMUserMessage,
  AssistantMessage as LLMAssistantMessage,
  ToolResultMessage as LLMToolResultMessage,
  ContentPart,
  ToolCallContent,
} from "@openkrow/llm";

import type {
  SendableMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
} from "../types/index.js";

/**
 * Convert an agent SendableMessage to the LLM Message format.
 * Strips timestamps and maps field names.
 */
export function toLLMMessage(msg: SendableMessage): LLMMessage {
  switch (msg.role) {
    case "user":
      return { role: "user", content: msg.content } satisfies LLMUserMessage;
    case "assistant":
      return { role: "assistant", content: msg.content } satisfies LLMAssistantMessage;
    case "tool":
      return {
        role: "tool",
        toolCallId: msg.toolCallId,
        content: msg.content,
        isError: msg.isError,
      } satisfies LLMToolResultMessage;
  }
}

/**
 * Convert an array of agent SendableMessages to LLM Messages.
 */
export function toLLMMessages(msgs: SendableMessage[]): LLMMessage[] {
  return msgs.map(toLLMMessage);
}

/**
 * Convert an LLM AssistantMessage back to an agent AssistantMessage (add timestamp).
 */
export function fromLLMAssistantMessage(msg: LLMAssistantMessage): Omit<AssistantMessage, "timestamp"> {
  return { role: "assistant", content: msg.content };
}

/**
 * Extract tool calls from an LLM AssistantMessage's content parts.
 */
export function extractToolCalls(msg: LLMAssistantMessage): ToolCallContent[] {
  return msg.content.filter((p): p is ToolCallContent => p.type === "tool_call");
}

/**
 * Check if an LLM AssistantMessage contains any tool calls.
 */
export function hasToolCalls(msg: LLMAssistantMessage): boolean {
  return msg.content.some((p) => p.type === "tool_call");
}
