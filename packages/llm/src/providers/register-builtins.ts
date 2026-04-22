/**
 * Register built-in API providers
 *
 * All providers are registered eagerly (no lazy loading for simplicity).
 */

import { registerApiProvider } from "../api-registry.js";
import { streamAnthropic } from "./anthropic.js";
import { streamOpenAICompletions } from "./openai.js";
import { streamGoogle } from "./google.js";

let registered = false;

/**
 * Register all built-in API providers.
 * Safe to call multiple times — providers are only registered once.
 */
export function registerBuiltInApiProviders(): void {
  if (registered) return;
  registered = true;

  registerApiProvider({
    api: "anthropic-messages",
    stream: streamAnthropic,
  });

  registerApiProvider({
    api: "openai-completions",
    stream: streamOpenAICompletions,
  });

  registerApiProvider({
    api: "google-generative-ai",
    stream: streamGoogle,
  });
}

// Auto-register on import
registerBuiltInApiProviders();
