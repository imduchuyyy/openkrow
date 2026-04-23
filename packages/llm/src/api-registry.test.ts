import { describe, it, expect, beforeEach } from "vitest";
import {
  registerApiProvider,
  getApiProvider,
  hasApiProvider,
  getRegisteredApis,
  clearApiProviders,
} from "./api-registry.js";
import type { ApiProvider, KnownApi } from "./types.js";
import { EventStream } from "./utils/event-stream.js";

function makeFakeProvider(api: KnownApi): ApiProvider {
  return {
    api,
    stream: () => {
      const s = new EventStream();
      s.end({ role: "assistant", content: [{ type: "text", text: "ok" }] });
      return s;
    },
  };
}

describe("api-registry", () => {
  beforeEach(() => {
    clearApiProviders();
  });

  it("starts empty after clear", () => {
    expect(getRegisteredApis()).toEqual([]);
  });

  it("registers and retrieves a provider", () => {
    const provider = makeFakeProvider("openai-completions");
    registerApiProvider(provider);
    expect(getApiProvider("openai-completions")).toBe(provider);
  });

  it("hasApiProvider returns correct values", () => {
    expect(hasApiProvider("openai-completions")).toBe(false);
    registerApiProvider(makeFakeProvider("openai-completions"));
    expect(hasApiProvider("openai-completions")).toBe(true);
  });

  it("getApiProvider throws for unregistered api", () => {
    expect(() => getApiProvider("anthropic-messages")).toThrow(/No provider registered/);
  });

  it("getRegisteredApis returns all registered", () => {
    registerApiProvider(makeFakeProvider("openai-completions"));
    registerApiProvider(makeFakeProvider("anthropic-messages"));
    const apis = getRegisteredApis();
    expect(apis).toContain("openai-completions");
    expect(apis).toContain("anthropic-messages");
    expect(apis).toHaveLength(2);
  });

  it("later registration overwrites earlier one", () => {
    const first = makeFakeProvider("openai-completions");
    const second = makeFakeProvider("openai-completions");
    registerApiProvider(first);
    registerApiProvider(second);
    expect(getApiProvider("openai-completions")).toBe(second);
  });
});
