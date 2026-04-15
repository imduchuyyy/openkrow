/**
 * Agent — Core agent runtime that orchestrates LLM calls, tool execution,
 * and context management.
 *
 * Key design changes from v0:
 * - Uses ContextManager instead of raw ConversationState (budget-aware)
 * - Uses ModelRouter instead of raw LLMClient (smart routing)
 * - Stream method now handles tool calls in a full agentic loop
 * - Enforces maxToolCallsPerTurn
 */

import { EventEmitter } from "eventemitter3";
import {
  createClient,
  ModelRouter,
  createRouter,
  type ChatMessage,
  type ChatOptions,
  type IModelRouter,
} from "@openkrow/ai";
import type {
  AgentConfig,
  AgentEvents,
  AgentMessage,
  AgentTurn,
  ToolResult,
} from "./types.js";
import { ToolRegistry } from "./tools.js";
import { ContextManager } from "./context.js";

export class Agent extends EventEmitter<AgentEvents> {
  readonly config: AgentConfig;
  readonly tools: ToolRegistry;
  readonly context: ContextManager;

  /**
   * @deprecated Use `context` instead. Kept for backward compatibility.
   */
  get state() {
    // Minimal backward-compat shim so existing code that reads
    // `agent.state.isRunning` or `agent.state.messages` still works.
    return {
      isRunning: this._isRunning,
      messages: this.context.getMessages(),
    };
  }

  private router: IModelRouter;
  private _isRunning = false;
  private turnCount = 0;
  private turns: AgentTurn[] = [];

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.tools = new ToolRegistry();

    // Build router: prefer explicit routing config, else wrap single LLM client
    if (config.routing) {
      this.router = new ModelRouter(config.routing);
    } else {
      // Backward compat: create a router that uses the same model for both
      this.router = createRouter({
        primary: {
          provider: config.llm.provider,
          model: config.llm.model,
          apiKey: config.llm.apiKey,
          baseUrl: config.llm.baseUrl,
        },
        background: {
          provider: config.llm.provider,
          model: config.llm.model,
          apiKey: config.llm.apiKey,
          baseUrl: config.llm.baseUrl,
        },
      });
    }

    this.context = new ContextManager(this.router);
    this.context.setSystemPrompt(config.systemPrompt);
  }

  /**
   * Run the agent with a user message. Loops through LLM calls and tool
   * executions until a final response is produced or max turns is reached.
   */
  async run(userMessage: string): Promise<string> {
    if (this._isRunning) {
      throw new Error("Agent is already running");
    }

    this._isRunning = true;
    this.context.addMessage({ role: "user", content: userMessage });

    const maxTurns = this.config.maxTurns ?? 10;
    const maxToolCalls = this.config.maxToolCallsPerTurn ?? 20;
    let finalResponse = "";

    try {
      for (let i = 0; i < maxTurns; i++) {
        const turn = this.startTurn();
        this.emit("turn:start", turn);

        // Check if compaction is needed
        await this.context.maybeCompact();

        const messages = this.context.buildMessages();
        const toolDefs = this.tools.getDefinitions();

        // Update tool definitions for budget tracking
        this.context.setToolDefinitions(toolDefs);

        const chatOptions: ChatOptions = {
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          maxTokens: this.config.llm.maxTokens,
          temperature: this.config.llm.temperature,
        };

        const response = await this.router.chat(messages, chatOptions);

        // Add assistant message
        const assistantMsg = this.context.addMessage({
          role: "assistant",
          content: response.content,
          toolCalls: response.toolCalls,
        });
        this.emit("message", assistantMsg);

        // If no tool calls, we're done
        if (!response.toolCalls || response.toolCalls.length === 0) {
          finalResponse = response.content;
          this.completeTurn(turn);
          this.emit("turn:end", turn);
          break;
        }

        // Execute tool calls (with limit)
        const callsToExecute = response.toolCalls.slice(0, maxToolCalls);
        for (const tc of callsToExecute) {
          const args = JSON.parse(tc.arguments) as Record<string, unknown>;
          this.emit("tool:call", tc.name, args);

          const result = await this.tools.execute(tc.name, args);
          this.emit("tool:result", tc.name, result);

          turn.toolCalls.push({ tool: tc.name, args, result });

          // Add tool result message
          const toolMsg = this.context.addMessage({
            role: "tool",
            content: result.output || result.error || "",
            toolCallId: tc.id,
          });
          this.emit("message", toolMsg);
        }

        this.completeTurn(turn);
        this.emit("turn:end", turn);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("error", err);
      throw err;
    } finally {
      this._isRunning = false;
      this.emit("done");
    }

    return finalResponse;
  }

  /**
   * Stream a response from the agent. Now handles tool calls in a full
   * agentic loop (unlike v0 which only yielded text deltas).
   */
  async *stream(userMessage: string): AsyncIterable<string> {
    if (this._isRunning) {
      throw new Error("Agent is already running");
    }

    this._isRunning = true;
    this.context.addMessage({ role: "user", content: userMessage });

    const maxTurns = this.config.maxTurns ?? 10;
    const maxToolCalls = this.config.maxToolCallsPerTurn ?? 20;

    try {
      for (let i = 0; i < maxTurns; i++) {
        const turn = this.startTurn();

        await this.context.maybeCompact();

        const messages = this.context.buildMessages();
        const toolDefs = this.tools.getDefinitions();
        this.context.setToolDefinitions(toolDefs);

        const chatOptions: ChatOptions = {
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          maxTokens: this.config.llm.maxTokens,
          temperature: this.config.llm.temperature,
        };

        // Collect streamed content and tool calls
        let fullContent = "";
        const pendingToolCalls: Array<{
          id: string;
          name: string;
          arguments: string;
        }> = [];
        let currentToolCallIndex = -1;

        for await (const event of this.router.stream(messages, chatOptions)) {
          if (event.type === "text_delta" && event.delta) {
            this.emit("stream:delta", event.delta);
            fullContent += event.delta;
            yield event.delta;
          }
          if (event.type === "tool_call_delta" && event.toolCall) {
            const tc = event.toolCall;
            if (tc.id) {
              // New tool call
              currentToolCallIndex = pendingToolCalls.length;
              pendingToolCalls.push({
                id: tc.id,
                name: tc.name ?? "",
                arguments: tc.arguments ?? "",
              });
            } else if (currentToolCallIndex >= 0) {
              // Append to current tool call
              const current = pendingToolCalls[currentToolCallIndex];
              if (tc.name) current.name = tc.name;
              if (tc.arguments) current.arguments += tc.arguments;
            }
          }
        }

        // Record the assistant message
        this.context.addMessage({
          role: "assistant",
          content: fullContent,
          toolCalls:
            pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
        });

        // If no tool calls, we're done
        if (pendingToolCalls.length === 0) {
          this.completeTurn(turn);
          break;
        }

        // Execute tool calls
        const callsToExecute = pendingToolCalls.slice(0, maxToolCalls);
        for (const tc of callsToExecute) {
          const args = JSON.parse(tc.arguments) as Record<string, unknown>;
          this.emit("tool:call", tc.name, args);

          const result = await this.tools.execute(tc.name, args);
          this.emit("tool:result", tc.name, result);

          turn.toolCalls.push({ tool: tc.name, args, result });

          this.context.addMessage({
            role: "tool",
            content: result.output || result.error || "",
            toolCallId: tc.id,
          });
        }

        this.completeTurn(turn);
      }
    } finally {
      this._isRunning = false;
      this.emit("done");
    }
  }

  /**
   * Get the model router for direct access (e.g., background tasks).
   */
  getRouter(): IModelRouter {
    return this.router;
  }

  // -----------------------------------------------------------------------
  // Turn management (lightweight, replaces ConversationState turn tracking)
  // -----------------------------------------------------------------------

  private startTurn(): AgentTurn {
    this.turnCount++;
    const turn: AgentTurn = {
      id: `turn-${this.turnCount}`,
      messages: [],
      toolCalls: [],
      startedAt: Date.now(),
    };
    this.turns.push(turn);
    return turn;
  }

  private completeTurn(turn: AgentTurn): void {
    turn.completedAt = Date.now();
  }
}
