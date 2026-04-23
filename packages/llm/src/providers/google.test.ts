import { describe, it, expect, vi, beforeEach } from "vitest";
import { streamGoogle } from "./google.js";
import type { Model, Context, StreamEvent } from "../types.js";

vi.mock("../resolve-credentials.js", () => ({
  resolveCredentials: vi.fn().mockResolvedValue({ apiKey: "test-key" }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeModel(overrides?: Partial<Model>): Model {
  return {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    api: "google-generative-ai",
    provider: "google",
    contextWindow: 1048576,
    maxTokens: 65536,
    supportsTools: true,
    supportsThinking: true,
    ...overrides,
  };
}

function makeContext(overrides?: Partial<Context>): Context {
  return {
    messages: [{ role: "user", content: "Hello" }],
    ...overrides,
  };
}

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

describe("Google provider", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("streams text from Gemini SSE response", async () => {
    const sseData = [
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] })}\n\n`,
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: " world" }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 } })}\n\n`,
    ];

    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    const stream = streamGoogle(makeModel(), makeContext());
    const events: StreamEvent[] = [];
    for await (const e of stream) {
      events.push(e);
    }

    const textDeltas = events.filter((e) => e.type === "text_delta");
    expect(textDeltas).toHaveLength(2);
    expect((textDeltas[0] as any).text).toBe("Hello");
    expect((textDeltas[1] as any).text).toBe(" world");

    const done = events.find((e) => e.type === "done") as any;
    expect(done.message.usage.inputTokens).toBe(5);
    expect(done.message.usage.outputTokens).toBe(3);
  });

  it("streams function calls", async () => {
    const sseData = [
      `data: ${JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              functionCall: { name: "get_weather", args: { location: "NYC" } }
            }]
          }
        }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10, totalTokenCount: 15 }
      })}\n\n`,
    ];

    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    const stream = streamGoogle(makeModel(), makeContext());
    const events: StreamEvent[] = [];
    for await (const e of stream) {
      events.push(e);
    }

    expect(events.some((e) => e.type === "tool_call_start")).toBe(true);
    expect(events.some((e) => e.type === "tool_call_end")).toBe(true);

    const done = events.find((e) => e.type === "done") as any;
    const toolCall = done.message.content.find((c: any) => c.type === "tool_call");
    expect(toolCall.name).toBe("get_weather");
    expect(JSON.parse(toolCall.arguments)).toEqual({ location: "NYC" });
  });

  it("handles API errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad Request"),
    });

    const stream = streamGoogle(makeModel(), makeContext());
    stream.result().catch(() => {});
    const events: StreamEvent[] = [];
    for await (const e of stream) {
      events.push(e);
    }

    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("passes API key as query param", async () => {
    const sseData = [
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } })}\n\n`,
    ];
    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    streamGoogle(makeModel(), makeContext());
    await new Promise((r) => setTimeout(r, 10));

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("key=test-key");
    expect(url).toContain("alt=sse");
  });

  it("includes systemInstruction when systemPrompt set", async () => {
    const sseData = [
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] })}\n\n`,
    ];
    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    streamGoogle(makeModel(), makeContext({ systemPrompt: "Be concise" }));
    await new Promise((r) => setTimeout(r, 10));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "Be concise" }] });
  });
});
