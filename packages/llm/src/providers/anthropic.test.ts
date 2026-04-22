import { describe, it, expect, vi, beforeEach } from "vitest";
import { streamAnthropic } from "./anthropic.js";
import type { Model, Context, StreamEvent } from "../types.js";

vi.mock("../resolve-credentials.js", () => ({
  resolveCredentials: vi.fn().mockResolvedValue({ apiKey: "test-key" }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeModel(overrides?: Partial<Model>): Model {
  return {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    api: "anthropic-messages",
    provider: "anthropic",
    contextWindow: 200000,
    maxTokens: 16000,
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

describe("Anthropic provider", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("streams text from content_block events", async () => {
    const sseData = [
      `event: message_start\ndata: ${JSON.stringify({ message: { usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
      `event: content_block_start\ndata: ${JSON.stringify({ content_block: { type: "text" } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ delta: { type: "text_delta", text: "Hello" } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ delta: { type: "text_delta", text: " world" } })}\n\n`,
      `event: content_block_stop\ndata: {}\n\n`,
      `event: message_delta\ndata: ${JSON.stringify({ usage: { output_tokens: 5 } })}\n\n`,
      `event: message_stop\ndata: {}\n\n`,
    ];

    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    const stream = streamAnthropic(makeModel(), makeContext());
    const events: StreamEvent[] = [];
    for await (const e of stream) {
      events.push(e);
    }

    const textDeltas = events.filter((e) => e.type === "text_delta");
    expect(textDeltas).toHaveLength(2);
    expect((textDeltas[0] as any).text).toBe("Hello");
    expect((textDeltas[1] as any).text).toBe(" world");

    const done = events.find((e) => e.type === "done") as any;
    expect(done.message.usage.inputTokens).toBe(10);
  });

  it("streams tool_use blocks", async () => {
    const sseData = [
      `event: message_start\ndata: ${JSON.stringify({ message: { usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
      `event: content_block_start\ndata: ${JSON.stringify({ content_block: { type: "tool_use", id: "tu_1", name: "search" } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ delta: { type: "input_json_delta", partial_json: '{"query":' } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ delta: { type: "input_json_delta", partial_json: '"hello"}' } })}\n\n`,
      `event: content_block_stop\ndata: {}\n\n`,
      `event: message_stop\ndata: {}\n\n`,
    ];

    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    const stream = streamAnthropic(makeModel(), makeContext());
    const events: StreamEvent[] = [];
    for await (const e of stream) {
      events.push(e);
    }

    expect(events.some((e) => e.type === "tool_call_start")).toBe(true);
    expect(events.some((e) => e.type === "tool_call_end")).toBe(true);

    const done = events.find((e) => e.type === "done") as any;
    const toolCall = done.message.content.find((c: any) => c.type === "tool_call");
    expect(toolCall.name).toBe("search");
    expect(toolCall.arguments).toBe('{"query":"hello"}');
  });

  it("handles API errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limited"),
    });

    const stream = streamAnthropic(makeModel(), makeContext());
    stream.result().catch(() => {});
    const events: StreamEvent[] = [];
    for await (const e of stream) {
      events.push(e);
    }

    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("sends x-api-key header", async () => {
    const sseData = [
      `event: message_start\ndata: ${JSON.stringify({ message: { usage: { input_tokens: 1 } } })}\n\n`,
      `event: message_stop\ndata: {}\n\n`,
    ];
    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    streamAnthropic(makeModel(), makeContext());
    await new Promise((r) => setTimeout(r, 10));

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("converts tool results as user messages", async () => {
    const sseData = [
      `event: message_start\ndata: ${JSON.stringify({ message: { usage: { input_tokens: 1 } } })}\n\n`,
      `event: message_stop\ndata: {}\n\n`,
    ];
    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sseData) });

    const context = makeContext({
      messages: [
        { role: "user", content: "What's the weather?" },
        {
          role: "assistant",
          content: [{ type: "tool_call", id: "tc_1", name: "weather", arguments: '{}' }],
        },
        { role: "tool", toolCallId: "tc_1", content: "Sunny 72F" },
      ],
    });

    streamAnthropic(makeModel(), context);
    await new Promise((r) => setTimeout(r, 10));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const toolResultMsg = body.messages.find((m: any) =>
      Array.isArray(m.content) && m.content.some((c: any) => c.type === "tool_result")
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.role).toBe("user");
  });
});
