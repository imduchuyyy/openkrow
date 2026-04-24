/**
 * createTool — Factory helper for building tools with consistent structure.
 *
 * Follows OpenCode's pattern of separating tool definition from execution,
 * with descriptions loaded from companion .txt files.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { Tool, ToolDefinition, ToolResult } from "../types/index.js";

/**
 * Load a companion .txt description file relative to the calling module.
 * Falls back to the provided default if the file cannot be read.
 */
export function loadDescription(importMetaUrl: string, filename: string, fallback?: string): string {
  try {
    const dir = dirname(fileURLToPath(importMetaUrl));
    const filepath = resolve(dir, filename);
    return readFileSync(filepath, "utf-8").trim();
  } catch {
    return fallback ?? "";
  }
}

export interface CreateToolOptions {
  name: string;
  description: string;
  parameters: ToolDefinition["parameters"];
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Create a Tool instance from a simple options object.
 */
export function createTool(options: CreateToolOptions): Tool {
  return {
    definition: {
      name: options.name,
      description: options.description,
      parameters: options.parameters,
    },
    execute: options.execute,
  };
}

/**
 * Helper to build a successful ToolResult.
 */
export function ok(output: string): ToolResult {
  return { success: true, output };
}

/**
 * Helper to build a failed ToolResult.
 */
export function fail(error: string): ToolResult {
  return { success: false, output: "", error };
}
