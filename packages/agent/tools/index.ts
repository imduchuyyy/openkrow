/**
 * ToolRegistry — Manages available tools.
 */

import type { Tool, ToolResult } from "../types/index.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: "", error: `Tool "${name}" not found` };
    }
    return tool.execute(args);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }
}
