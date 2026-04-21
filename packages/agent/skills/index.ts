/**
 * SkillManager — Manages local skills (SKILL.md) and MCP server connections.
 *
 * Skills extend the agent with additional tools. Two types:
 * - "local": File-based skills with SKILL.md + tool JSON schemas
 * - "mcp": MCP server processes that expose tools via the MCP protocol
 *
 * Local skill directory structure:
 *   ~/.config/openkrow/skills/<skill-name>/
 *   ├── SKILL.md            # Name, description, tools, prompts
 *   ├── tools/
 *   │   ├── tool-name.json  # Tool definition (JSON Schema)
 *   │   └── ...
 *   └── resources/
 *
 * Registry: ~/.config/openkrow/skills/registry.json
 */

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { ToolDefinition } from "@openkrow/ai";
import type {
  ISkillManager,
  Skill,
  MCPServerConfig,
  ToolResult,
} from "../types/index.js";

const SKILLS_DIR = join(homedir(), ".config", "openkrow", "skills");
const REGISTRY_FILE = join(SKILLS_DIR, "registry.json");

interface SkillRegistry {
  skills: Array<{
    name: string;
    type: "local" | "mcp";
    path?: string;
    mcpConfig?: MCPServerConfig;
    enabled: boolean;
    installedAt: number;
  }>;
}

/**
 * Parse a SKILL.md file to extract skill metadata.
 *
 * Expected format:
 * ```markdown
 * # Skill Name
 * Description text.
 * ## Tools
 * - tool_name: Tool description.
 * ## Setup
 * Setup instructions (optional).
 * ```
 */
function parseSkillMd(
  content: string
): { name: string; description: string; toolNames: string[] } {
  const lines = content.split("\n");
  let name = "";
  let description = "";
  const toolNames: string[] = [];
  let section = "header";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      name = trimmed.slice(2).trim();
      section = "description";
      continue;
    }

    if (trimmed.startsWith("## Tools")) {
      section = "tools";
      continue;
    }

    if (trimmed.startsWith("## ")) {
      section = "other";
      continue;
    }

    if (section === "description" && trimmed) {
      description += (description ? " " : "") + trimmed;
    }

    if (section === "tools" && trimmed.startsWith("- ")) {
      const match = trimmed.match(/^- (\w+):/);
      if (match) {
        toolNames.push(match[1]);
      }
    }
  }

  return { name: name || "unknown", description, toolNames };
}

export class SkillManager implements ISkillManager {
  private skills = new Map<string, Skill>();
  private mcpProcesses = new Map<string, { kill: () => void }>();

  /**
   * Load the skill registry and all enabled skills from disk.
   */
  async initialize(): Promise<void> {
    const registry = await this.loadRegistry();

    for (const entry of registry.skills) {
      if (!entry.enabled) continue;

      if (entry.type === "local" && entry.path) {
        try {
          const skill = await this.loadLocalSkill(entry.path);
          this.skills.set(skill.name, skill);
        } catch {
          // Skip skills that fail to load
        }
      }
    }
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  async install(source: string): Promise<Skill> {
    // Source is a path to a directory containing SKILL.md
    const skillPath = source;

    if (!existsSync(join(skillPath, "SKILL.md"))) {
      throw new Error(`No SKILL.md found at ${skillPath}`);
    }

    const skill = await this.loadLocalSkill(skillPath);

    // Copy to global skills directory
    const destPath = join(SKILLS_DIR, skill.name);
    await mkdir(destPath, { recursive: true });

    // For now, just register the source path (no copy)
    // In a full implementation, we'd copy files over.
    this.skills.set(skill.name, skill);

    // Update registry
    const registry = await this.loadRegistry();
    const existing = registry.skills.findIndex((s) => s.name === skill.name);
    const entry = {
      name: skill.name,
      type: "local" as const,
      path: skillPath,
      enabled: true,
      installedAt: Date.now(),
    };

    if (existing >= 0) {
      registry.skills[existing] = entry;
    } else {
      registry.skills.push(entry);
    }
    await this.saveRegistry(registry);

    return skill;
  }

  async uninstall(name: string): Promise<void> {
    // Disconnect MCP if running
    const proc = this.mcpProcesses.get(name);
    if (proc) {
      proc.kill();
      this.mcpProcesses.delete(name);
    }

    this.skills.delete(name);

    // Remove from registry
    const registry = await this.loadRegistry();
    registry.skills = registry.skills.filter((s) => s.name !== name);
    await this.saveRegistry(registry);

    // Remove skill directory if it exists
    const skillDir = join(SKILLS_DIR, name);
    if (existsSync(skillDir)) {
      await rm(skillDir, { recursive: true, force: true });
    }
  }

  async connectMCP(config: MCPServerConfig): Promise<Skill> {
    // MCP connection is a placeholder — full MCP protocol requires:
    // 1. Spawn process (stdio) or connect HTTP
    // 2. Send `initialize` to negotiate capabilities
    // 3. Call `tools/list` to discover tools
    // 4. Register tools with skill: prefix
    //
    // For now, we create a stub skill that will be connected later.

    const skill: Skill = {
      name: config.name,
      description: `MCP server: ${config.name}`,
      type: "mcp",
      tools: [],
      enabled: true,
    };

    this.skills.set(config.name, skill);

    // Update registry
    const registry = await this.loadRegistry();
    const existing = registry.skills.findIndex(
      (s) => s.name === config.name
    );
    const entry = {
      name: config.name,
      type: "mcp" as const,
      mcpConfig: config,
      enabled: true,
      installedAt: Date.now(),
    };

    if (existing >= 0) {
      registry.skills[existing] = entry;
    } else {
      registry.skills.push(entry);
    }
    await this.saveRegistry(registry);

    return skill;
  }

  getToolDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = [];
    for (const skill of this.skills.values()) {
      if (!skill.enabled) continue;
      for (const tool of skill.tools) {
        defs.push({
          ...tool,
          // Prefix with skill name to avoid collisions
          name: `${skill.name}:${tool.name}`,
        });
      }
    }
    return defs;
  }

  async executeTool(
    skillName: string,
    toolName: string,
    _args: Record<string, unknown>
  ): Promise<ToolResult> {
    const skill = this.skills.get(skillName);
    if (!skill) {
      return {
        success: false,
        output: "",
        error: `Skill "${skillName}" not found`,
      };
    }

    if (!skill.enabled) {
      return {
        success: false,
        output: "",
        error: `Skill "${skillName}" is disabled`,
      };
    }

    // For MCP skills, forward to the MCP server (not yet implemented)
    if (skill.type === "mcp") {
      return {
        success: false,
        output: "",
        error: `MCP tool execution not yet implemented for "${skillName}:${toolName}"`,
      };
    }

    // For local skills, execute the tool (requires tool implementation)
    return {
      success: false,
      output: "",
      error: `Local tool execution not yet implemented for "${skillName}:${toolName}"`,
    };
  }

  async shutdown(): Promise<void> {
    for (const [name, proc] of this.mcpProcesses) {
      proc.kill();
      this.mcpProcesses.delete(name);
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async loadLocalSkill(skillPath: string): Promise<Skill> {
    const skillMdPath = join(skillPath, "SKILL.md");
    const content = await readFile(skillMdPath, "utf-8");
    const { name, description, toolNames } = parseSkillMd(content);

    // Load tool definitions from tools/ directory
    const tools: ToolDefinition[] = [];
    const toolsDir = join(skillPath, "tools");

    if (existsSync(toolsDir)) {
      const files = await readdir(toolsDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const raw = await readFile(join(toolsDir, file), "utf-8");
          const def = JSON.parse(raw) as ToolDefinition;
          tools.push(def);
        } catch {
          // Skip malformed tool definitions
        }
      }
    }

    // If no tool JSON files found, create stubs from SKILL.md tool names
    if (tools.length === 0 && toolNames.length > 0) {
      for (const toolName of toolNames) {
        tools.push({
          name: toolName,
          description: `Tool from skill "${name}"`,
          parameters: { type: "object", properties: {} },
        });
      }
    }

    return {
      name,
      description,
      type: "local",
      tools,
      enabled: true,
    };
  }

  private async loadRegistry(): Promise<SkillRegistry> {
    try {
      const raw = await readFile(REGISTRY_FILE, "utf-8");
      return JSON.parse(raw) as SkillRegistry;
    } catch {
      return { skills: [] };
    }
  }

  private async saveRegistry(registry: SkillRegistry): Promise<void> {
    await mkdir(SKILLS_DIR, { recursive: true });
    await writeFile(
      REGISTRY_FILE,
      JSON.stringify(registry, null, 2) + "\n",
      "utf-8"
    );
  }
}
