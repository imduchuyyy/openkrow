import { describe, it, expect } from "vitest";
import { EventStream } from "./event-stream.js";
import type { StreamEvent, AssistantMessage } from "../types.js";

const msg: AssistantMessage = {
  role: "assistant",
  content: [{ type: "text", text: "hello" }],
};

describe("EventStream", () => {
  describe("basic push + iterate", () => {
    it("delivers pushed events via async iteration", async () => {
      const stream = new EventStream();

      // Push events and end synchronously (they queue)
      stream.push({ type: "text_start" });
      stream.push({ type: "text_delta", text: "hi" });
      stream.push({ type: "text_end" });
      stream.end(msg);

      const events: StreamEvent[] = [];
      for await (const e of stream) {
        events.push(e);
      }

      expect(events).toHaveLength(4); // 3 + done event
      expect(events[0].type).toBe("text_start");
      expect(events[1].type).toBe("text_delta");
      expect(events[2].type).toBe("text_end");
      expect(events[3].type).toBe("done");
    });
  });

  describe("result()", () => {
    it("resolves with the final message after end()", async () => {
      const stream = new EventStream();
      stream.end(msg);
      const result = await stream.result();
      expect(result).toEqual(msg);
    });

    it("rejects on error()", async () => {
      const stream = new EventStream();
      stream.error(new Error("boom"));
      await expect(stream.result()).rejects.toThrow("boom");
    });
  });

  describe("error handling", () => {
    it("delivers error event then stops iteration", async () => {
      const stream = new EventStream();
      // Prevent unhandled rejection on the result promise
      stream.result().catch(() => {});
      stream.push({ type: "text_start" });
      stream.error(new Error("fail"));

      const events: StreamEvent[] = [];
      for await (const e of stream) {
        events.push(e);
      }

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("text_start");
      expect(events[1].type).toBe("error");
      if (events[1].type === "error") {
        expect(events[1].error.message).toBe("fail");
      }
    });
  });

  describe("idempotency", () => {
    it("ignores push after end", async () => {
      const stream = new EventStream();
      stream.end(msg);
      stream.push({ type: "text_start" }); // should be ignored

      const events: StreamEvent[] = [];
      for await (const e of stream) {
        events.push(e);
      }

      expect(events).toHaveLength(1); // only done
      expect(events[0].type).toBe("done");
    });

    it("ignores second end", async () => {
      const stream = new EventStream();
      const msg2: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: "second" }],
      };
      stream.end(msg);
      stream.end(msg2);
      const result = await stream.result();
      expect(result).toEqual(msg);
    });

    it("ignores error after end", async () => {
      const stream = new EventStream();
      stream.end(msg);
      stream.error(new Error("late error"));
      const result = await stream.result();
      expect(result).toEqual(msg);
    });
  });

  describe("async producer pattern", () => {
    it("consumer waits for producer to push events", async () => {
      const stream = new EventStream();

      // Produce events asynchronously
      setTimeout(() => {
        stream.push({ type: "text_start" });
        stream.push({ type: "text_delta", text: "async" });
        stream.push({ type: "text_end" });
        stream.end(msg);
      }, 10);

      const events: StreamEvent[] = [];
      for await (const e of stream) {
        events.push(e);
      }

      expect(events).toHaveLength(4);
      expect(events[3].type).toBe("done");
    });
  });
});
