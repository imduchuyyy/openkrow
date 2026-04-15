import { EventEmitter } from "eventemitter3";
import { createClient, type ChatMessage } from "@openkrow/ai";
import type { AgentConfig, AgentEvents, AgentMessage, ToolResult } from "./types.js";
import { ToolRegistry } from "./tools.js";
import { ConversationState } from "./state.js";

/**
 * Core agent runtime that orchestrates LLM calls, tool execution,
 * and conversation state management.
 */
export class Agent extends EventEmitter<AgentEvents> {
  readonly config: AgentConfig;
  readonly tools: ToolRegistry;
  readonly state: ConversationState;
  private client;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.tools = new ToolRegistry();
    this.state = new ConversationState();
    this.client = createClient(config.llm);
  }

  /**
   * Run the agent with a user message. The agent will loop through
   * LLM calls and tool executions until it produces a final response
   * or hits the max turns limit.
   */
  async run(userMessage: string): Promise<string> {
    if (this.state.isRunning) {
      throw new Error("Agent is already running");
    }

    this.state.setRunning(true);
    this.state.addMessage({ role: "user", content: userMessage });

    const maxTurns = this.config.maxTurns ?? 10;
    let finalResponse = "";

    try {
      for (let i = 0; i < maxTurns; i++) {
        const turn = this.state.startTurn();
        this.emit("turn:start", turn);

        const messages = this.buildMessages();
        const toolDefs = this.tools.getDefinitions();

        const response = await this.client.chat(messages, {
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          maxTokens: this.config.llm.maxTokens,
          temperature: this.config.llm.temperature,
        });

        // Add assistant message
        const assistantMsg = this.state.addMessage({
          role: "assistant",
          content: response.content,
          toolCalls: response.toolCalls,
        });
        this.emit("message", assistantMsg);

        // If no tool calls, we're done
        if (!response.toolCalls || response.toolCalls.length === 0) {
          finalResponse = response.content;
          this.state.completeTurn(turn.id);
          this.emit("turn:end", turn);
          break;
        }

        // Execute tool calls
        for (const tc of response.toolCalls) {
          const args = JSON.parse(tc.arguments) as Record<string, unknown>;
          this.emit("tool:call", tc.name, args);

          const result = await this.tools.execute(tc.name, args);
          this.emit("tool:result", tc.name, result);

          turn.toolCalls.push({ tool: tc.name, args, result });

          // Add tool result message
          const toolMsg = this.state.addMessage({
            role: "tool",
            content: result.output || result.error || "",
            toolCallId: tc.id,
          });
          this.emit("message", toolMsg);
        }

        this.state.completeTurn(turn.id);
        this.emit("turn:end", turn);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("error", err);
      throw err;
    } finally {
      this.state.setRunning(false);
      this.emit("done");
    }

    return finalResponse;
  }

  /**
   * Stream a response from the agent for a user message.
   */
  async *stream(userMessage: string): AsyncIterable<string> {
    if (this.state.isRunning) {
      throw new Error("Agent is already running");
    }

    this.state.setRunning(true);
    this.state.addMessage({ role: "user", content: userMessage });

    try {
      const messages = this.buildMessages();
      const toolDefs = this.tools.getDefinitions();

      for await (const event of this.client.stream(messages, {
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        maxTokens: this.config.llm.maxTokens,
        temperature: this.config.llm.temperature,
      })) {
        if (event.type === "text_delta" && event.delta) {
          this.emit("stream:delta", event.delta);
          yield event.delta;
        }
      }
    } finally {
      this.state.setRunning(false);
      this.emit("done");
    }
  }

  private buildMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: "system", content: this.config.systemPrompt },
    ];

    for (const msg of this.state.messages) {
      messages.push({
        role: msg.role,
        content: msg.content,
        toolCalls: msg.toolCalls,
        toolCallId: msg.toolCallId,
      });
    }

    return messages;
  }
}
