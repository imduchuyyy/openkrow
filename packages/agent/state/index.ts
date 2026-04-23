/**
 * ConversationState — Tracks conversation state.
 * @deprecated Use ContextManager instead.
 */

import type { Message } from "../types/index.js";

export class ConversationState {
  private messages: Message[] = [];
  private _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  setRunning(running: boolean): void {
    this._isRunning = running;
  }

  addMessage(message: Omit<Message, "timestamp"> & { timestamp?: number }): Message {
    const full = { ...message, timestamp: message.timestamp ?? Date.now() } as Message;
    this.messages.push(full);
    return full;
  }

  getMessages(): ReadonlyArray<Message> {
    return this.messages;
  }

  reset(): void {
    this.messages = [];
    this._isRunning = false;
  }
}
