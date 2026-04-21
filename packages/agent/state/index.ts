/**
 * @deprecated ConversationState is superseded by ContextManager.
 * Kept for backward compatibility. New code should use ContextManager directly.
 */

import type { AgentState, AgentMessage, AgentTurn } from "../types/index.js";
import { randomUUID } from "node:crypto";

export class ConversationState {
  private _state: AgentState;

  constructor(conversationId?: string) {
    this._state = {
      conversationId: conversationId ?? randomUUID(),
      turns: [],
      messages: [],
      isRunning: false,
      currentTurn: 0,
    };
  }

  get id(): string {
    return this._state.conversationId;
  }

  get isRunning(): boolean {
    return this._state.isRunning;
  }

  get messages(): ReadonlyArray<AgentMessage> {
    return this._state.messages;
  }

  get turns(): ReadonlyArray<AgentTurn> {
    return this._state.turns;
  }

  get currentTurnNumber(): number {
    return this._state.currentTurn;
  }

  setRunning(running: boolean): void {
    this._state.isRunning = running;
  }

  addMessage(message: Omit<AgentMessage, "timestamp">): AgentMessage {
    const fullMessage: AgentMessage = {
      ...message,
      timestamp: Date.now(),
    };
    this._state.messages.push(fullMessage);
    return fullMessage;
  }

  startTurn(): AgentTurn {
    const turn: AgentTurn = {
      id: randomUUID(),
      messages: [],
      toolCalls: [],
      startedAt: Date.now(),
    };
    this._state.turns.push(turn);
    this._state.currentTurn = this._state.turns.length;
    return turn;
  }

  completeTurn(turnId: string): void {
    const turn = this._state.turns.find((t) => t.id === turnId);
    if (turn) {
      turn.completedAt = Date.now();
    }
  }

  getSnapshot(): Readonly<AgentState> {
    return { ...this._state };
  }

  reset(): void {
    this._state.turns = [];
    this._state.messages = [];
    this._state.isRunning = false;
    this._state.currentTurn = 0;
  }
}
