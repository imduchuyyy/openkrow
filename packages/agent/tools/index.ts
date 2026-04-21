import type { ToolDefinition } from "@openkrow/ai";
import type { Tool as AgentTool, ToolResult } from "../types/index.js";

/**
 * Registry for managing available tools in an agent.
 */
export class ToolRegistry {
  private tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool "${tool.definition.name}" is already registered`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async execute(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        output: "",
        error: `Tool "${name}" not found`,
      };
    }

    try {
      return await tool.execute(args);
    } catch (error) {
      return {
        success: false,
        output: "",
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  clear(): void {
    this.tools.clear();
  }
}
