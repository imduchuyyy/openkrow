import { describe, it, expect, vi, beforeEach } from "vitest";
import { stream, complete, getTextContent } from "./stream.js";
import { clearApiProviders, registerApiProvider } from "./api-registry.js";
import { EventStream } from "./utils/event-stream.js";
import type { Model, AssistantMessage } from "./types.js";

// We need to prevent the auto-registration in register-builtins.ts from
// importing the real providers. Instead we register our own fake provider.

describe("stream.ts top-level API", () => {
  const fakeMessage: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: "Hello from fake" }],
    usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
  };

  const fakeModel: Model = {
    id: "fake-model",
    name: "Fake",
    api: "openai-completions",
    provider: "openai",
    contextWindow: 1000,
    maxTokens: 100,
    supportsTools: false,
    supportsThinking: false,
  };

  beforeEach(() => {
    clearApiProviders();
    registerApiProvider({
      api: "openai-completions",
      stream: (_model, _context, _options) => {
        const s = new EventStream();
        setTimeout(() => {
          s.push({ type: "text_start" });
          s.push({ type: "text_delta", text: "Hello from fake" });
          s.push({ type: "text_end" });
          s.end(fakeMessage);
        }, 0);
        return s;
      },
    });
  });

  describe("stream()", () => {
    it("returns an async iterable of events", async () => {
      const s = stream(fakeModel, { messages: [{ role: "user", content: "Hi" }] });
      const events = [];
      for await (const e of s) {
        events.push(e);
      }
      expect(events.some((e) => e.type === "text_delta")).toBe(true);
      expect(events.some((e) => e.type === "done")).toBe(true);
    });

    it("result() resolves to the final message", async () => {
      const s = stream(fakeModel, { messages: [{ role: "user", content: "Hi" }] });
      const result = await s.result();
      expect(result).toEqual(fakeMessage);
    });

    it("throws for unregistered api", () => {
      const badModel = { ...fakeModel, api: "anthropic-messages" as const };
      expect(() =>
        stream(badModel, { messages: [{ role: "user", content: "Hi" }] })
      ).toThrow(/No provider registered/);
    });
  });

  describe("complete()", () => {
    it("returns the final AssistantMessage", async () => {
      const result = await complete(fakeModel, { messages: [{ role: "user", content: "Hi" }] });
      expect(result).toEqual(fakeMessage);
    });
  });

  describe("getTextContent()", () => {
    it("extracts text from message content", () => {
      const text = getTextContent(fakeMessage);
      expect(text).toBe("Hello from fake");
    });

    it("joins multiple text parts", () => {
      const msg: AssistantMessage = {
        role: "assistant",
        content: [
          { type: "text", text: "Part 1" },
          { type: "tool_call", id: "tc", name: "fn", arguments: "{}" },
          { type: "text", text: "Part 2" },
        ],
      };
      expect(getTextContent(msg)).toBe("Part 1Part 2");
    });

    it("returns empty string when no text parts", () => {
      const msg: AssistantMessage = {
        role: "assistant",
        content: [{ type: "tool_call", id: "tc", name: "fn", arguments: "{}" }],
      };
      expect(getTextContent(msg)).toBe("");
    });
  });
});
