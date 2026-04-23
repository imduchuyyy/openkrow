import { describe, it, expect, vi } from "vitest";
import {
  registerOAuthProvider,
  getOAuthProvider,
  getOAuthProviderIds,
  getOAuthApiKey,
  isExpired,
} from "./index.js";

describe("OAuth registry", () => {
  describe("isExpired", () => {
    it("returns true when expired", () => {
      expect(isExpired({ refresh: "", access: "", expires: Date.now() - 1000 })).toBe(true);
    });

    it("returns false when not expired", () => {
      expect(isExpired({ refresh: "", access: "", expires: Date.now() + 60_000 })).toBe(false);
    });

    it("accounts for buffer", () => {
      const expires = Date.now() + 30_000;
      expect(isExpired({ refresh: "", access: "", expires }, 60_000)).toBe(true);
      expect(isExpired({ refresh: "", access: "", expires }, 10_000)).toBe(false);
    });
  });

  describe("provider registration", () => {
    it("built-in providers are registered", () => {
      const ids = getOAuthProviderIds();
      expect(ids).toContain("github-copilot");
      expect(ids).toContain("anthropic");
    });

    it("getOAuthProvider returns registered provider", () => {
      const copilot = getOAuthProvider("github-copilot");
      expect(copilot).toBeDefined();
      expect(copilot!.name).toBe("GitHub Copilot");
    });

    it("getOAuthProvider returns undefined for unknown", () => {
      expect(getOAuthProvider("nonexistent")).toBeUndefined();
    });
  });

  describe("getOAuthApiKey", () => {
    it("throws for unknown provider", async () => {
      await expect(
        getOAuthApiKey("nonexistent", { refresh: "", access: "", expires: Date.now() + 60_000 })
      ).rejects.toThrow(/Unknown OAuth provider/);
    });

    it("returns apiKey without refresh when not expired", async () => {
      const mockProvider = {
        id: "test-oauth",
        name: "Test",
        login: vi.fn(),
        refreshToken: vi.fn(),
        getApiKey: (creds: any) => `key-${creds.access}`,
      };
      registerOAuthProvider(mockProvider);

      const result = await getOAuthApiKey("test-oauth", {
        refresh: "ref",
        access: "acc",
        expires: Date.now() + 3_600_000,
      });

      expect(result.apiKey).toBe("key-acc");
      expect(mockProvider.refreshToken).not.toHaveBeenCalled();
    });

    it("refreshes expired credentials", async () => {
      const mockProvider = {
        id: "test-refresh",
        name: "TestRefresh",
        login: vi.fn(),
        refreshToken: vi.fn().mockResolvedValue({
          refresh: "new-ref",
          access: "new-acc",
          expires: Date.now() + 3_600_000,
        }),
        getApiKey: (creds: any) => creds.access,
      };
      registerOAuthProvider(mockProvider);

      const result = await getOAuthApiKey("test-refresh", {
        refresh: "old-ref",
        access: "old-acc",
        expires: Date.now() - 1000, // expired
      });

      expect(result.apiKey).toBe("new-acc");
      expect(result.credentials.refresh).toBe("new-ref");
      expect(mockProvider.refreshToken).toHaveBeenCalled();
    });
  });
});
