/**
 * ContextManager — The "working memory" brain of the agent.
 *
 * Manages what information gets sent to the LLM each turn within a
 * finite token budget. Implements sliding window + summary compaction.
 *
 * Context window layout (top to bottom):
 * 1. SYSTEM PROMPT — base instructions + workspace context + personality
 * 2. SUMMARY BLOCK — compressed older conversation turns
 * 3. CACHED SECTION — pinned content (workspace memories, key files)
 * 4. ACTIVE CONVERSATION — recent messages (sliding window)
 * 5. TOOL DEFINITIONS — budgeted separately
 */

import type { ChatMessage, ToolDefinition, IModelRouter } from "@openkrow/ai";
import type {
  IContextManager,
  ContextBudget,
  AgentMessage,
  WorkspaceContext,
  UserPersonality,
} from "./types.js";

/**
 * Rough token estimation: ~4 characters per token.
 * This is a heuristic — real token counting requires a tokenizer.
 * Good enough for budget management; the LLM API will reject if we overshoot.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Number of recent turns to keep when compacting. */
const COMPACTION_KEEP_TURNS = 4;

/** Compaction triggers when conversation tokens exceed this fraction of total. */
const COMPACTION_THRESHOLD = 0.6;

export class ContextManager implements IContextManager {
  private budget: number = 128_000;
  private baseSystemPrompt: string = "";
  private workspaceContext: WorkspaceContext | null = null;
  private personality: UserPersonality | null = null;
  private summaryBlock: string | null = null;
  private cachedContent = new Map<string, string>();
  private messages: AgentMessage[] = [];
  private toolDefinitions: ToolDefinition[] = [];
  private router: IModelRouter | null = null;

  /**
   * @param router — Optional model router for auto-compaction (uses background model).
   *                  If not provided, compact() will do a naive truncation.
   */
  constructor(router?: IModelRouter) {
    this.router = router ?? null;
  }

  setBudget(maxTokens: number): void {
    this.budget = maxTokens;
  }

  getUsage(): ContextBudget {
    const systemTokens = estimateTokens(this.buildSystemPrompt());
    const summaryTokens = this.summaryBlock
      ? estimateTokens(this.summaryBlock)
      : 0;

    let cachedTokens = 0;
    for (const content of this.cachedContent.values()) {
      cachedTokens += estimateTokens(content);
    }

    let conversationTokens = 0;
    for (const msg of this.messages) {
      conversationTokens += estimateTokens(msg.content);
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          conversationTokens += estimateTokens(tc.arguments);
        }
      }
    }

    let toolTokens = 0;
    for (const tool of this.toolDefinitions) {
      toolTokens += estimateTokens(
        JSON.stringify(tool.parameters) + tool.name + tool.description
      );
    }

    const used = systemTokens + summaryTokens + cachedTokens + conversationTokens + toolTokens;

    return {
      total: this.budget,
      system: systemTokens,
      summary: summaryTokens,
      cached: cachedTokens,
      conversation: conversationTokens,
      tools: toolTokens,
      available: Math.max(0, this.budget - used),
    };
  }

  buildMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 1. System prompt
    messages.push({
      role: "system",
      content: this.buildSystemPrompt(),
    });

    // 2. Summary block (as a system message)
    if (this.summaryBlock) {
      messages.push({
        role: "system",
        content: `## Conversation Summary (older messages)\n${this.summaryBlock}`,
      });
    }

    // 3. Cached content (as system messages)
    for (const [key, content] of this.cachedContent) {
      messages.push({
        role: "system",
        content: `## Cached: ${key}\n${content}`,
      });
    }

    // 4. Active conversation messages
    for (const msg of this.messages) {
      messages.push({
        role: msg.role,
        content: msg.content,
        toolCalls: msg.toolCalls,
        toolCallId: msg.toolCallId,
      });
    }

    return messages;
  }

  addMessage(message: Omit<AgentMessage, "timestamp">): AgentMessage {
    const fullMessage: AgentMessage = {
      ...message,
      timestamp: Date.now(),
    };
    this.messages.push(fullMessage);
    return fullMessage;
  }

  pinToCache(key: string, content: string): void {
    this.cachedContent.set(key, content);
  }

  unpinFromCache(key: string): void {
    this.cachedContent.delete(key);
  }

  async compact(): Promise<void> {
    if (this.messages.length <= COMPACTION_KEEP_TURNS * 2) {
      // Not enough messages to compact
      return;
    }

    // Split: keep last N*2 messages (each turn = user + assistant = ~2 messages),
    // summarize everything before that.
    const keepCount = COMPACTION_KEEP_TURNS * 2;
    const toSummarize = this.messages.slice(0, this.messages.length - keepCount);
    const toKeep = this.messages.slice(this.messages.length - keepCount);

    // Build text to summarize
    const conversationText = toSummarize
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n");

    // Include existing summary for context
    const fullContent = this.summaryBlock
      ? `Previous summary:\n${this.summaryBlock}\n\nNew messages to incorporate:\n${conversationText}`
      : conversationText;

    if (this.router) {
      // Use background model for summarization
      this.summaryBlock = await this.router.background({
        type: "summarize",
        content: fullContent,
      });
    } else {
      // Naive fallback: just concatenate first/last lines
      const lines = conversationText.split("\n");
      this.summaryBlock = [
        "Summary of earlier conversation:",
        ...lines.slice(0, 5),
        "...",
        ...lines.slice(-3),
      ].join("\n");
    }

    this.messages = toKeep;
  }

  /**
   * Check if auto-compaction should trigger and run it if needed.
   * Called internally after adding messages.
   */
  async maybeCompact(): Promise<boolean> {
    const usage = this.getUsage();
    if (usage.conversation > usage.total * COMPACTION_THRESHOLD) {
      await this.compact();
      return true;
    }
    return false;
  }

  setSystemContext(
    context: WorkspaceContext,
    personality?: UserPersonality
  ): void {
    this.workspaceContext = context;
    if (personality) {
      this.personality = personality;
    }
  }

  setSystemPrompt(prompt: string): void {
    this.baseSystemPrompt = prompt;
  }

  setToolDefinitions(tools: ToolDefinition[]): void {
    this.toolDefinitions = tools;
  }

  getMessages(): ReadonlyArray<AgentMessage> {
    return this.messages;
  }

  getSummary(): string | null {
    return this.summaryBlock;
  }

  reset(): void {
    this.messages = [];
    this.summaryBlock = null;
    this.cachedContent.clear();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildSystemPrompt(): string {
    const parts: string[] = [];

    // Base prompt
    if (this.baseSystemPrompt) {
      parts.push(this.baseSystemPrompt);
    }

    // Workspace context
    if (this.workspaceContext) {
      const ctx = this.workspaceContext;
      parts.push(
        [
          "## Workspace Context",
          `- Project: ${ctx.projectName}`,
          `- Summary: ${ctx.summary}`,
          ctx.techStack.length > 0
            ? `- Tech stack: ${ctx.techStack.join(", ")}`
            : null,
          ctx.conventions.length > 0
            ? `- Conventions: ${ctx.conventions.join("; ")}`
            : null,
          ctx.keyFiles.length > 0
            ? `- Key files: ${ctx.keyFiles.join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    // User personality
    if (this.personality) {
      const p = this.personality;
      const lines = [
        "## User Context",
        `- Communication: ${p.communicationStyle.verbosity}, ${p.communicationStyle.formality}`,
        `- Expertise: ${p.technical.expertiseLevel}`,
      ];
      if (p.technical.preferredLanguages.length > 0) {
        lines.push(
          `- Languages: ${p.technical.preferredLanguages.join(", ")}`
        );
      }
      if (p.technical.codingStyle.length > 0) {
        lines.push(`- Style: ${p.technical.codingStyle.join(", ")}`);
      }
      if (p.observations.length > 0) {
        lines.push(
          `- Observations: ${p.observations.join("; ")}`
        );
      }
      parts.push(lines.join("\n"));
    }

    return parts.join("\n\n");
  }
}
