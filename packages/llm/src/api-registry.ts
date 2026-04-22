/**
 * API Provider Registry
 *
 * A registry that maps API protocol names to their provider implementations.
 * Providers are registered at module load time and looked up by `stream()`.
 */

import type { ApiProvider, KnownApi } from "./types.js";

const providers = new Map<string, ApiProvider>();

/**
 * Register an API provider
 */
export function registerApiProvider(provider: ApiProvider): void {
  providers.set(provider.api, provider);
}

/**
 * Get a registered API provider by its API protocol name
 * @throws Error if no provider is registered for the given API
 */
export function getApiProvider(api: KnownApi): ApiProvider {
  const provider = providers.get(api);
  if (!provider) {
    throw new Error(
      `No provider registered for API "${api}". ` +
        `Available: ${[...providers.keys()].join(", ") || "(none)"}. ` +
        `Call registerBuiltInApiProviders() first.`
    );
  }
  return provider;
}

/**
 * Check if a provider is registered for the given API
 */
export function hasApiProvider(api: KnownApi): boolean {
  return providers.has(api);
}

/**
 * Get all registered API names
 */
export function getRegisteredApis(): KnownApi[] {
  return [...providers.keys()] as KnownApi[];
}

/**
 * Clear all registered providers (useful for testing)
 */
export function clearApiProviders(): void {
  providers.clear();
}
