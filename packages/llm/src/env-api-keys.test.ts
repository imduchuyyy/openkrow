import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveApiKey } from "./env-api-keys.js";

describe("env-api-keys", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all relevant env vars
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GITHUB_COPILOT_TOKEN;
  });

  afterEach(() => {
    // Restore
    Object.assign(process.env, originalEnv);
  });

  it("resolves OPENAI_API_KEY for openai", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(resolveApiKey("openai")).toBe("sk-test");
  });

  it("resolves ANTHROPIC_API_KEY for anthropic", () => {
    process.env.ANTHROPIC_API_KEY = "ant-test";
    expect(resolveApiKey("anthropic")).toBe("ant-test");
  });

  it("resolves GEMINI_API_KEY for google (first priority)", () => {
    process.env.GEMINI_API_KEY = "gem-test";
    process.env.GOOGLE_API_KEY = "goo-test";
    expect(resolveApiKey("google")).toBe("gem-test");
  });

  it("falls back to GOOGLE_API_KEY for google", () => {
    process.env.GOOGLE_API_KEY = "goo-test";
    expect(resolveApiKey("google")).toBe("goo-test");
  });

  it("resolves GITHUB_COPILOT_TOKEN for github-copilot", () => {
    process.env.GITHUB_COPILOT_TOKEN = "ghu-test";
    expect(resolveApiKey("github-copilot")).toBe("ghu-test");
  });

  it("returns undefined when no env var is set", () => {
    expect(resolveApiKey("openai")).toBeUndefined();
    expect(resolveApiKey("anthropic")).toBeUndefined();
    expect(resolveApiKey("google")).toBeUndefined();
  });

  it("returns undefined for unknown provider", () => {
    // Cast to test unknown provider
    expect(resolveApiKey("nonexistent" as any)).toBeUndefined();
  });

  it("ignores empty string env vars", () => {
    process.env.OPENAI_API_KEY = "";
    expect(resolveApiKey("openai")).toBeUndefined();
  });
});
