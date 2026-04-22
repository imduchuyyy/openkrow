/**
 * Top-level stream() and complete() functions
 *
 * These are the main public API for interacting with LLMs.
 * They resolve the provider from the model's API type and delegate to it.
 */

import type {
  Model,
  Context,
  StreamOptions,
  AssistantMessage,
  AssistantMessageEventStream,
} from "./types.js";
import { getApiProvider } from "./api-registry.js";

// Ensure built-in providers are registered
import "./providers/register-builtins.js";

/**
 * Stream a response from an LLM.
 *
 * Returns an AssistantMessageEventStream that can be iterated with `for await...of`
 * to receive streaming events, or awaited with `.result()` for the final message.
 *
 * @example
 * ```ts
 * import { stream, getModelById } from "@openkrow/llm";
 *
 * const model = getModelById("claude-sonnet-4-20250514")!;
 * const eventStream = stream(model, {
 *   systemPrompt: "You are a helpful assistant.",
 *   messages: [{ role: "user", content: "Hello!" }],
 * });
 *
 * // Iterate events
 * for await (const event of eventStream) {
 *   if (event.type === "text_delta") {
 *     process.stdout.write(event.text);
 *   }
 * }
 *
 * // Or just get the final message
 * const message = await eventStream.result();
 * ```
 */
export function stream(
  model: Model,
  context: Context,
  options?: StreamOptions
): AssistantMessageEventStream {
  const provider = getApiProvider(model.api);
  return provider.stream(model, context, options);
}

/**
 * Send a message and wait for the complete response.
 *
 * This is a convenience wrapper around `stream()` that collects
 * the full response and returns it as an AssistantMessage.
 *
 * @example
 * ```ts
 * import { complete, getModelById } from "@openkrow/llm";
 *
 * const model = getModelById("claude-sonnet-4-20250514")!;
 * const message = await complete(model, {
 *   systemPrompt: "You are a helpful assistant.",
 *   messages: [{ role: "user", content: "Hello!" }],
 * });
 *
 * console.log(message.content);
 * ```
 */
export async function complete(
  model: Model,
  context: Context,
  options?: StreamOptions
): Promise<AssistantMessage> {
  const eventStream = stream(model, context, options);
  return eventStream.result();
}

/**
 * Get just the text content from an AssistantMessage.
 * Convenience helper that extracts and joins all text parts.
 */
export function getTextContent(message: AssistantMessage): string {
  return message.content
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
}
