/**
 * EventStream — Push-based async iterable for streaming LLM responses.
 *
 * Inspired by pi-mono's EventStream. Providers create a stream, push events
 * into it from an async IIFE, and consumers iterate with `for await...of`.
 */

import type {
  StreamEvent,
  AssistantMessage,
  AssistantMessageEventStream,
} from "../types.js";

interface Waiter<T> {
  resolve: (value: IteratorResult<T>) => void;
  reject: (error: Error) => void;
}

/**
 * A push-based async iterable stream of events with a final result.
 *
 * Usage (provider side):
 * ```ts
 * const stream = new EventStream();
 * (async () => {
 *   stream.push({ type: "text_delta", text: "Hello" });
 *   stream.end({ role: "assistant", content: [...] });
 * })();
 * return stream;
 * ```
 *
 * Usage (consumer side):
 * ```ts
 * for await (const event of stream) {
 *   if (event.type === "text_delta") process(event.text);
 * }
 * const message = await stream.result();
 * ```
 */
export class EventStream implements AssistantMessageEventStream {
  private queue: StreamEvent[] = [];
  private waiters: Waiter<StreamEvent>[] = [];
  private done = false;
  private _result: AssistantMessage | null = null;
  private _error: Error | null = null;
  private resultPromise: Promise<AssistantMessage>;
  private resolveResult!: (msg: AssistantMessage) => void;
  private rejectResult!: (err: Error) => void;

  constructor() {
    this.resultPromise = new Promise<AssistantMessage>((resolve, reject) => {
      this.resolveResult = resolve;
      this.rejectResult = reject;
    });
  }

  /**
   * Push an event into the stream
   */
  push(event: StreamEvent): void {
    if (this.done) return;

    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.resolve({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  /**
   * End the stream with a final AssistantMessage
   */
  end(message: AssistantMessage): void {
    if (this.done) return;
    this.done = true;
    this._result = message;

    // Push done event
    const doneEvent: StreamEvent = { type: "done", message };
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.resolve({ value: doneEvent, done: false });
    } else {
      this.queue.push(doneEvent);
    }

    // Resolve all remaining waiters
    for (const waiter of this.waiters) {
      waiter.resolve({ value: undefined as unknown as StreamEvent, done: true });
    }
    this.waiters = [];

    this.resolveResult(message);
  }

  /**
   * End the stream with an error
   */
  error(err: Error): void {
    if (this.done) return;
    this.done = true;
    this._error = err;

    // Push error event
    const errorEvent: StreamEvent = { type: "error", error: err };
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.resolve({ value: errorEvent, done: false });
    } else {
      this.queue.push(errorEvent);
    }

    // Reject all remaining waiters
    for (const waiter of this.waiters) {
      waiter.resolve({ value: undefined as unknown as StreamEvent, done: true });
    }
    this.waiters = [];

    this.rejectResult(err);
  }

  /**
   * Get the final AssistantMessage once the stream completes
   */
  result(): Promise<AssistantMessage> {
    return this.resultPromise;
  }

  // --- AsyncIterable implementation ---

  [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    return {
      next: (): Promise<IteratorResult<StreamEvent>> => {
        // Return queued events first
        if (this.queue.length > 0) {
          const event = this.queue.shift()!;
          // If this is a terminal event, signal iterator done on next call
          if (event.type === "done" || event.type === "error") {
            return Promise.resolve({ value: event, done: false });
          }
          return Promise.resolve({ value: event, done: false });
        }

        // Stream is done and queue is empty
        if (this.done) {
          return Promise.resolve({
            value: undefined as unknown as StreamEvent,
            done: true,
          });
        }

        // Wait for next event
        return new Promise<IteratorResult<StreamEvent>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      },
    };
  }
}
