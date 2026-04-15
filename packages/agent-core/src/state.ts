import type { AgentState, AgentMessage, AgentTurn } from "./types.js";
import { randomUUID } from "node:crypto";

/**
 * Manages conversation state and history for an agent session.
 */
export class ConversationState {
  private state: AgentState;

  constructor(conversationId?: string) {
    this.state = {
      conversationId: conversationId ?? randomUUID(),
      turns: [],
      messages: [],
      isRunning: false,
      currentTurn: 0,
    };
  }

  get id(): string {
    return this.state.conversationId;
  }

  get isRunning(): boolean {
    return this.state.isRunning;
  }

  get messages(): ReadonlyArray<AgentMessage> {
    return this.state.messages;
  }

  get turns(): ReadonlyArray<AgentTurn> {
    return this.state.turns;
  }

  get currentTurnNumber(): number {
    return this.state.currentTurn;
  }

  setRunning(running: boolean): void {
    this.state.isRunning = running;
  }

  addMessage(message: Omit<AgentMessage, "timestamp">): AgentMessage {
    const fullMessage: AgentMessage = {
      ...message,
      timestamp: Date.now(),
    };
    this.state.messages.push(fullMessage);
    return fullMessage;
  }

  startTurn(): AgentTurn {
    const turn: AgentTurn = {
      id: randomUUID(),
      messages: [],
      toolCalls: [],
      startedAt: Date.now(),
    };
    this.state.turns.push(turn);
    this.state.currentTurn = this.state.turns.length;
    return turn;
  }

  completeTurn(turnId: string): void {
    const turn = this.state.turns.find((t) => t.id === turnId);
    if (turn) {
      turn.completedAt = Date.now();
    }
  }

  getSnapshot(): Readonly<AgentState> {
    return { ...this.state };
  }

  reset(): void {
    this.state.turns = [];
    this.state.messages = [];
    this.state.isRunning = false;
    this.state.currentTurn = 0;
  }
}
