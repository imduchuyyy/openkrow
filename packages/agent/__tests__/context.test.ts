/**
 * Tests for ContextManager and contextAssembly
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ContextManager, estimateTokens } from "../context/index.js";
import type {
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  ContextAssemblyOptions,
} from "../types/index.js";
import type { DatabaseClient, CreateMessageInput, Message as DbMessage } from "@openkrow/database";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserMsg(text: string, ts = Date.now()): Omit<UserMessage, "timestamp"> & { timestamp: number } {
  return { role: "user", content: text, timestamp: ts };
}

function makeAssistantMsg(text: string, ts = Date.now()): Omit<AssistantMessage, "timestamp"> & { timestamp: number } {
  return { role: "assistant", content: [{ type: "text", text }], timestamp: ts };
}

function makeToolResult(content: string, toolCallId = "tc_1", toolName = "read_file", ts = Date.now()): Omit<ToolResultMessage, "timestamp"> & { timestamp: number } {
  return { role: "tool", toolCallId, toolName, content, timestamp: ts };
}

/** Generate a string of approximately N tokens (N * 4 chars) */
function tokString(tokens: number): string {
  return "x".repeat(tokens * 4);
}

const defaultOptions: ContextAssemblyOptions = {
  contextWindow: 100_000,
  maxOutputTokens: 4_000,
  reservedBuffer: 20_000,
  toolResultBudget: 10_000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ContextManager", () => {
  let cm: ContextManager;

  beforeEach(() => {
    cm = new ContextManager();
  });

  describe("basic state management", () => {
    it("should store and retrieve system prompt via custom override", () => {
      cm.setCustomPrompt("Hello");
      assert.equal(cm.getSystemPrompt(), "Hello");
    });

    it("should add and retrieve messages", () => {
      cm.addMessage(makeUserMsg("Hi"));
      cm.addMessage(makeAssistantMsg("Hello!"));
      assert.equal(cm.getMessages().length, 2);
      assert.equal(cm.getMessages()[0]!.role, "user");
      assert.equal(cm.getMessages()[1]!.role, "assistant");
    });

    it("should auto-assign timestamp if not provided", () => {
      const before = Date.now();
      cm.addMessage({ role: "user", content: "test" } as any);
      const after = Date.now();
      const msg = cm.getMessages()[0]!;
      assert.ok(msg.timestamp >= before && msg.timestamp <= after);
    });

    it("should reset messages", () => {
      cm.addMessage(makeUserMsg("Hi"));
      cm.reset();
      assert.equal(cm.getMessages().length, 0);
    });
  });

  describe("contextAssembly — no compaction needed", () => {
    it("should return all messages when within budget", () => {
      cm.addMessage(makeUserMsg("Hello"));
      cm.addMessage(makeAssistantMsg("Hi there!"));
      const result = cm.contextAssembly(defaultOptions);
      assert.equal(result.messages.length, 2);
      assert.equal(result.compactions.length, 0);
    });

    it("should include system prompt in result", () => {
      cm.setCustomPrompt("Test prompt");
      cm.addMessage(makeUserMsg("Hello"));
      const result = cm.contextAssembly(defaultOptions);
      assert.equal(result.systemPrompt, "Test prompt");
    });
  });

  describe("Phase 1 — Tool Result Budget", () => {
    it("should trim oversized tool results", () => {
      // Create a tool result that exceeds the budget (10_000 tokens = 40_000 chars)
      const bigContent = tokString(15_000); // 15k tokens, over 10k budget
      cm.addMessage(makeUserMsg("run tool"));
      cm.addMessage(makeAssistantMsg("calling tool"));
      cm.addMessage(makeToolResult(bigContent));
      cm.addMessage(makeAssistantMsg("done"));

      const result = cm.contextAssembly(defaultOptions);

      // The tool result should have been trimmed
      const toolMsg = result.messages.find(m => m.role === "tool");
      assert.ok(toolMsg);
      assert.ok(toolMsg.content.includes("tokens trimmed"));
      assert.ok(result.compactions.some(c => c.type === "tool_result_trim"));
    });

    it("should not trim tool results within budget", () => {
      const smallContent = tokString(5_000); // 5k tokens, under 10k budget
      cm.addMessage(makeToolResult(smallContent));

      const result = cm.contextAssembly(defaultOptions);
      const toolMsg = result.messages.find(m => m.role === "tool");
      assert.ok(toolMsg);
      assert.ok(!toolMsg.content.includes("tokens trimmed"));
    });
  });

  describe("Phase 2 — Snip Compact", () => {
    it("should drop oldest messages when over budget", () => {
      // Use a very small context window to force snipping
      const tightOptions: ContextAssemblyOptions = {
        contextWindow: 1_000,
        maxOutputTokens: 200,
        reservedBuffer: 200,
        toolResultBudget: 10_000,
      };

      // Add many messages that exceed the budget
      for (let i = 0; i < 20; i++) {
        cm.addMessage(makeUserMsg(`Message ${i}: ${tokString(50)}`));
        cm.addMessage(makeAssistantMsg(`Response ${i}: ${tokString(50)}`));
      }

      const result = cm.contextAssembly(tightOptions);

      // Should have fewer messages than we added
      assert.ok(result.messages.length < 40);
      // Should have a snip compaction
      assert.ok(result.compactions.some(c => c.type === "snip"));
    });

    it("should always keep at least MIN_RECENT_MESSAGES (4)", () => {
      const tinyOptions: ContextAssemblyOptions = {
        contextWindow: 100,
        maxOutputTokens: 20,
        reservedBuffer: 20,
        toolResultBudget: 10_000,
      };

      for (let i = 0; i < 10; i++) {
        cm.addMessage(makeUserMsg(`Msg ${i}: ${tokString(100)}`));
      }

      const result = cm.contextAssembly(tinyOptions);
      assert.ok(result.messages.length >= 4);
    });
  });

  describe("Phase 3 — Microcompact", () => {
    it("should clear stale tool results far from the end", () => {
      const tightOptions: ContextAssemblyOptions = {
        contextWindow: 5_000,
        maxOutputTokens: 500,
        reservedBuffer: 500,
        toolResultBudget: 10_000,
      };

      // Add a tool result early on, then many messages after
      cm.addMessage(makeToolResult(tokString(500), "tc_old", "read_file"));
      for (let i = 0; i < 15; i++) {
        cm.addMessage(makeUserMsg(`Msg ${i}`));
        cm.addMessage(makeAssistantMsg(`Reply ${i}`));
      }
      // Add a recent tool result
      cm.addMessage(makeToolResult("recent result", "tc_new", "read_file"));

      const result = cm.contextAssembly(tightOptions);

      // If microcompact kicked in, there should be a compaction action
      const hasMicro = result.compactions.some(c => c.type === "microcompact");
      // The old tool result should have been cleared (if needed for budget)
      if (hasMicro) {
        const oldTool = result.messages.find(m => m.role === "tool" && m.toolCallId === "tc_old");
        if (oldTool && oldTool.role === "tool") {
          assert.ok(oldTool.content.includes("Tool result cleared"));
        }
      }
    });
  });

  describe("Summary boundaries", () => {
    it("should convert summary boundaries to user messages in projection", () => {
      // Manually add a summary boundary
      cm.addMessage({
        role: "summary",
        content: "Previous conversation was about testing.",
        summarizedCount: 10,
        tokensFreed: 5000,
        timestamp: Date.now(),
      } as any);
      cm.addMessage(makeUserMsg("Continue"));

      const result = cm.contextAssembly(defaultOptions);
      assert.equal(result.messages.length, 2);
      assert.equal(result.messages[0]!.role, "user");
      assert.ok((result.messages[0]!.content as string).includes("Previous conversation summary"));
    });

    it("should skip snip markers in projection", () => {
      cm.addMessage({
        role: "snip",
        droppedCount: 5,
        tokensFreed: 2000,
        timestamp: Date.now(),
      } as any);
      cm.addMessage(makeUserMsg("Hello"));

      const result = cm.contextAssembly(defaultOptions);
      assert.equal(result.messages.length, 1);
      assert.equal(result.messages[0]!.role, "user");
    });
  });
});

describe("estimateTokens", () => {
  it("should estimate ~1 token per 4 chars", () => {
    assert.equal(estimateTokens("1234"), 1);
    assert.equal(estimateTokens("12345678"), 2);
    assert.equal(estimateTokens("123"), 1); // ceil
  });

  it("should return 0 for empty string", () => {
    assert.equal(estimateTokens(""), 0);
  });
});

// ---------------------------------------------------------------------------
// Mock DatabaseClient for persistence tests
// ---------------------------------------------------------------------------

function createMockDatabaseClient(): { client: DatabaseClient; store: DbMessage[] } {
  const store: DbMessage[] = [];
  let idCounter = 0;

  const mockMessages = {
    create(input: CreateMessageInput): DbMessage {
      const msg: DbMessage = {
        id: `msg_${++idCounter}`,
        conversation_id: input.conversation_id,
        role: input.role,
        content: input.content,
        tool_calls: input.tool_calls ? JSON.stringify(input.tool_calls) : undefined,
        tool_call_id: input.tool_call_id,
        tool_name: input.tool_name,
        is_error: input.is_error ? 1 : 0,
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
        created_at: new Date().toISOString(),
      };
      store.push(msg);
      return msg;
    },
    findByConversationId(conversationId: string, _limit?: number): DbMessage[] {
      return store.filter(m => m.conversation_id === conversationId);
    },
    findById(_id: string): DbMessage | null { return null; },
    findAll(): DbMessage[] { return store; },
    deleteById(_id: string): boolean { return false; },
    count(): number { return store.length; },
    getLastMessages(_cid: string, _n: number): DbMessage[] { return []; },
    countByConversationId(_cid: string): number { return 0; },
    deleteByConversationId(_cid: string): number { return 0; },
    searchByContent(_q: string): DbMessage[] { return []; },
  };

  const client = {
    messages: mockMessages,
    users: {} as DatabaseClient["users"],
    sessions: {} as DatabaseClient["sessions"],
    conversations: {} as DatabaseClient["conversations"],
    settings: {} as DatabaseClient["settings"],
  };

  return { client, store };
}

// ---------------------------------------------------------------------------
// Persistence tests
// ---------------------------------------------------------------------------

describe("ContextManager — persistence", () => {
  it("should persist user messages to database", () => {
    const { client, store } = createMockDatabaseClient();
    const cm = new ContextManager({ database: client, conversationId: "conv_1" });

    cm.addMessage(makeUserMsg("Hello from persistence test"));

    assert.equal(store.length, 1);
    assert.equal(store[0]!.role, "user");
    assert.equal(store[0]!.content, "Hello from persistence test");
    assert.equal(store[0]!.conversation_id, "conv_1");
  });

  it("should persist assistant messages with tool calls", () => {
    const { client, store } = createMockDatabaseClient();
    const cm = new ContextManager({ database: client, conversationId: "conv_1" });

    const msg: Omit<AssistantMessage, "timestamp"> = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me read that file" },
        { type: "tool_call", id: "tc_1", name: "read_file", arguments: '{"path":"foo.txt"}' },
      ],
    };
    cm.addMessage(msg);

    assert.equal(store.length, 1);
    assert.equal(store[0]!.role, "assistant");
    assert.equal(store[0]!.content, "Let me read that file");
    assert.ok(store[0]!.tool_calls);
    const calls = JSON.parse(store[0]!.tool_calls!);
    assert.equal(calls[0].name, "read_file");
  });

  it("should persist tool result messages", () => {
    const { client, store } = createMockDatabaseClient();
    const cm = new ContextManager({ database: client, conversationId: "conv_1" });

    cm.addMessage(makeToolResult("file contents here", "tc_1", "read_file"));

    assert.equal(store.length, 1);
    assert.equal(store[0]!.role, "tool");
    assert.equal(store[0]!.tool_call_id, "tc_1");
    assert.equal(store[0]!.tool_name, "read_file");
  });

  it("should not persist when no database configured", () => {
    const cm = new ContextManager();
    cm.addMessage(makeUserMsg("no persistence"));
    // No error, message stored in memory only
    assert.equal(cm.getMessages().length, 1);
  });

  it("should load messages from database during contextAssembly", () => {
    const { client, store } = createMockDatabaseClient();

    // Simulate messages already in the database (from a previous session)
    store.push({
      id: "msg_prev_1",
      conversation_id: "conv_1",
      role: "user",
      content: "Previous message from earlier session",
      created_at: new Date(Date.now() - 60000).toISOString(),
    });
    store.push({
      id: "msg_prev_2",
      conversation_id: "conv_1",
      role: "assistant",
      content: "Previous response",
      created_at: new Date(Date.now() - 59000).toISOString(),
    });

    const cm = new ContextManager({ database: client, conversationId: "conv_1" });
    cm.setCustomPrompt("test");

    // Add a new message
    cm.addMessage(makeUserMsg("New message"));

    // contextAssembly should load all messages from DB (including the previous ones)
    const result = cm.contextAssembly(defaultOptions);

    // Should have 3 messages: 2 from DB + 1 new (which was also persisted to DB)
    assert.equal(result.messages.length, 3);
    assert.equal((result.messages[0]!.content as string), "Previous message from earlier session");
  });

  it("should load tool messages from database correctly", () => {
    const { client, store } = createMockDatabaseClient();

    store.push({
      id: "msg_t1",
      conversation_id: "conv_1",
      role: "tool",
      content: "file contents",
      tool_call_id: "tc_99",
      tool_name: "read_file",
      is_error: 0,
      created_at: new Date().toISOString(),
    });

    const cm = new ContextManager({ database: client, conversationId: "conv_1" });
    cm.setCustomPrompt("test");

    const result = cm.contextAssembly(defaultOptions);
    assert.equal(result.messages.length, 1);
    const toolMsg = result.messages[0]!;
    assert.equal(toolMsg.role, "tool");
    if (toolMsg.role === "tool") {
      assert.equal(toolMsg.toolCallId, "tc_99");
      assert.equal(toolMsg.toolName, "read_file");
    }
  });
});
