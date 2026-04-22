import { describe, it, expect, vi, beforeEach } from "vitest";
import { streamOpenAICompletions } from "./openai.js";
import type { Model, Context, StreamEvent } from "../types.js";

// Mock resolveCredentials to avoid env dependency
vi.mock("../resolve-credentials.js", () => ({
  resolveCredentials: vi.fn().mockResolvedValue({ apiKey: "test-key" }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeModel(overrides?: Partial<Model>): Model {
  return {
    id: "gpt-4o",
    name: "GPT-4o",
    api: "openai-completions",
    provider: "openai",
    contextWindow: 128000,
    maxTokens: 16384,
    supportsTools: true,
    supportsThinking: false,
    ...overrides,
  };
}

function makeContext(overrides?: Partial<Context>): Context {
  return {
    messages: [{ role: "user", content: "Hello" }],
    ...overrides,
  };
}

/**
 * Create a ReadableStream that emits SSE data chunks
 */
function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("OpenAI provider", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("streams text deltas from SSE response", async () => {
    const sseData = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: " world" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`,
      `data: [DONE]\n\n`,
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      body: sseStream(sseData),
    });

    const stream = streamOpenAICompletions(makeModel(), makeContext());
    const events: StreamEvent[] = [];
    for await (const e of stream) {
      events.push(e);
    }

    const textDeltas = events.filter((e) => e.type === "text_delta");
    expect(textDeltas).toHaveLength(2);
    expect((textDeltas[0] as any).text).toBe("Hello");
    expect((textDeltas[1] as any).text).toBe(" world");

    expect(events.some((e) => e.type === "text_start")).toBe(true);
    expect(events.some((e) => e.type === "text_end")).toBe(true);
    expect(events.some((e) => e.type === "done")).toBe(true);

    const done = events.find((e) => e.type === "done") as any;
    expect(done.message.usage.inputTokens).toBe(10);
    expect(done.message.usage.outputTokens).toBe(5);
  });

  it("streams tool calls", async () => {
    const sseData = [
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "get_weather", arguments: '{"loc' } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ation":"NY"}' } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}\n\n`,
      `data: [DONE]\n\n`,
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      body: sseStream(sseData),
    });

    const stream = streamOpenAICompletions(makeModel(), makeContext());
    const events: StreamEvent[] = [];
    for await (const e of stream) {
      events.push(e);
    }

    expect(events.some((e) => e.type === "tool_call_start")).toBe(true);
    expect(events.some((e) => e.type === "tool_call_delta")).toBe(true);
    expect(events.some((e) => e.type === "tool_call_end")).toBe(true);

    const done = events.find((e) => e.type === "done") as any;
    const toolCall = done.message.content.find((c: any) => c.type === "tool_call");
    expect(toolCall.name).toBe("get_weather");
    expect(toolCall.arguments).toBe('{"location":"NY"}');
  });

  it("handles API errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    const stream = streamOpenAICompletions(makeModel(), makeContext());
    stream.result().catch(() => {});
    const events: StreamEvent[] = [];
    for await (const e of stream) {
      events.push(e);
    }

    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("handles missing credentials", async () => {
    // Override the mock to return undefined
    const { resolveCredentials } = await import("../resolve-credentials.js");
    vi.mocked(resolveCredentials).mockResolvedValueOnce(undefined);

    const stream = streamOpenAICompletions(makeModel(), makeContext());
    stream.result().catch(() => {});
    const events: StreamEvent[] = [];
    for await (const e of stream) {
      events.push(e);
    }

    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("uses custom baseUrl from model", async () => {
    const sseData = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
      `data: [DONE]\n\n`,
    ];

    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    const model = makeModel({ baseUrl: "https://api.x.ai/v1", provider: "xai" });
    streamOpenAICompletions(model, makeContext());

    // Wait a tick for the async IIFE to call fetch
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.x.ai/v1/chat/completions",
      expect.anything()
    );
  });

  it("sends system prompt as system message", async () => {
    const sseData = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
      `data: [DONE]\n\n`,
    ];

    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    streamOpenAICompletions(makeModel(), makeContext({ systemPrompt: "Be helpful" }));

    await new Promise((r) => setTimeout(r, 10));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: "system", content: "Be helpful" });
    expect(body.messages[1]).toEqual({ role: "user", content: "Hello" });
  });

  it("converts tool definitions to OpenAI format", async () => {
    const sseData = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
      `data: [DONE]\n\n`,
    ];

    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    const context = makeContext({
      tools: [{
        name: "get_weather",
        description: "Get weather",
        parameters: { type: "object", properties: { location: { type: "string" } } },
      }],
    });

    streamOpenAICompletions(makeModel(), context);
    await new Promise((r) => setTimeout(r, 10));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].type).toBe("function");
    expect(body.tools[0].function.name).toBe("get_weather");
  });

  it("injects copilot headers for github-copilot provider", async () => {
    const sseData = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
      `data: [DONE]\n\n`,
    ];

    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    const model = makeModel({ provider: "github-copilot" });
    streamOpenAICompletions(model, makeContext());
    await new Promise((r) => setTimeout(r, 10));

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-Initiator"]).toBeDefined();
    expect(headers["Openai-Intent"]).toBe("conversation-edits");
    expect(headers["Editor-Version"]).toBeDefined();
  });
});
