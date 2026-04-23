import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveCredentials } from "./resolve-credentials.js";
import type { OAuthCredentialsInput } from "./types.js";

// We need to mock the OAuth registry to avoid side effects
vi.mock("./utils/oauth/index.js", () => {
  const providers = new Map<string, any>();
  return {
    getOAuthProvider: (id: string) => providers.get(id),
    isExpired: (creds: { expires: number }, bufferMs = 0) => Date.now() + bufferMs >= creds.expires,
    registerOAuthProvider: (p: any) => providers.set(p.id, p),
  };
});

import { registerOAuthProvider } from "./utils/oauth/index.js";

describe("resolveCredentials", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  describe("priority: apiKey > oauth > env", () => {
    it("returns apiKey when provided", async () => {
      process.env.OPENAI_API_KEY = "env-key";
      const result = await resolveCredentials("openai", { apiKey: "explicit-key" });
      expect(result).toEqual({ apiKey: "explicit-key" });
    });

    it("returns oauth token when no apiKey but oauthCredentials provided", async () => {
      const oauth: OAuthCredentialsInput = {
        providerId: "test-provider",
        refresh: "ref",
        access: "acc-token",
        expires: Date.now() + 3_600_000, // far future
      };
      const result = await resolveCredentials("openai", { oauthCredentials: oauth });
      // No registered provider for "test-provider", so returns access directly
      expect(result?.apiKey).toBe("acc-token");
    });

    it("falls back to env var when no apiKey or oauth", async () => {
      process.env.OPENAI_API_KEY = "env-key";
      const result = await resolveCredentials("openai");
      expect(result?.apiKey).toBe("env-key");
    });

    it("returns undefined when nothing is available", async () => {
      const result = await resolveCredentials("openai");
      expect(result).toBeUndefined();
    });
  });

  describe("envFallback option", () => {
    it("disables env fallback when envFallback=false", async () => {
      process.env.OPENAI_API_KEY = "env-key";
      const result = await resolveCredentials("openai", { envFallback: false });
      expect(result).toBeUndefined();
    });

    it("enables env fallback by default", async () => {
      process.env.OPENAI_API_KEY = "env-key";
      const result = await resolveCredentials("openai", {});
      expect(result?.apiKey).toBe("env-key");
    });
  });

  describe("OAuth token refresh", () => {
    it("refreshes expired tokens and calls onRefresh", async () => {
      const onRefresh = vi.fn();

      // Register a fake OAuth provider
      registerOAuthProvider({
        id: "fake-oauth",
        name: "Fake",
        login: vi.fn(),
        refreshToken: vi.fn().mockResolvedValue({
          refresh: "new-ref",
          access: "new-acc",
          expires: Date.now() + 3_600_000,
        }),
        getApiKey: (creds: any) => creds.access,
      });

      const oauth: OAuthCredentialsInput = {
        providerId: "fake-oauth",
        refresh: "old-ref",
        access: "old-acc",
        expires: Date.now() - 1000, // expired
        onRefresh,
      };

      const result = await resolveCredentials("openai", { oauthCredentials: oauth });
      expect(result?.apiKey).toBe("new-acc");
      expect(onRefresh).toHaveBeenCalledWith(
        expect.objectContaining({ refresh: "new-ref", access: "new-acc" })
      );
    });

    it("uses getApiKey from provider for non-expired tokens", async () => {
      registerOAuthProvider({
        id: "key-transform",
        name: "KeyTransform",
        login: vi.fn(),
        refreshToken: vi.fn(),
        getApiKey: (creds: any) => `transformed-${creds.access}`,
      });

      const oauth: OAuthCredentialsInput = {
        providerId: "key-transform",
        refresh: "ref",
        access: "raw",
        expires: Date.now() + 3_600_000,
      };

      const result = await resolveCredentials("openai", { oauthCredentials: oauth });
      expect(result?.apiKey).toBe("transformed-raw");
    });

    it("uses access token as-is when provider not registered and token expired", async () => {
      const oauth: OAuthCredentialsInput = {
        providerId: "unknown-provider",
        refresh: "ref",
        access: "stale-token",
        expires: Date.now() - 1000,
      };

      const result = await resolveCredentials("openai", { oauthCredentials: oauth });
      expect(result?.apiKey).toBe("stale-token");
    });
  });
});
