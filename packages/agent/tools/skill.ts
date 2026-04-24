/**
 * SkillTool — Load a specialized skill by name.
 *
 * Delegates to the SkillManager to find the skill, then reads the
 * skill content (SKILL.md or similar) and returns it to the LLM.
 * Skill management (install, discovery) is handled elsewhere.
 */

import { createTool, loadDescription, ok, fail } from "./create-tool.js";
import type { Tool } from "../types/index.js";
import type { SkillManager } from "../skills/index.js";

const DESCRIPTION = loadDescription(import.meta.url, "skill.txt");

export interface SkillContent {
  name: string;
  content: string;
  directory?: string;
}

/**
 * Callback to load full skill content by name.
 * The actual loading logic (reading SKILL.md, listing files, etc.)
 * is provided by the caller since it depends on the skill storage backend.
 */
export type SkillLoader = (name: string) => Promise<SkillContent | undefined>;

export function createSkillTool(
  skillManager: SkillManager,
  loader?: SkillLoader,
): Tool {
  return createTool({
    name: "skill",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the skill from available_skills",
        },
      },
      required: ["name"],
    },
    execute: async (args) => {
      const name = args.name as string;
      if (!name) return fail("name is required");

      // Check if skill exists in the registry
      const skill = skillManager.get(name);
      if (!skill) {
        const available = skillManager.list().map((s) => s.name).join(", ");
        return fail(`Skill "${name}" not found. Available skills: ${available || "none"}`);
      }

      if (!skill.enabled) {
        return fail(`Skill "${name}" is disabled.`);
      }

      // If a loader is provided, load the full content
      if (loader) {
        const content = await loader(name);
        if (!content) {
          return fail(`Failed to load content for skill "${name}".`);
        }

        const output = [
          `<skill_content name="${content.name}">`,
          `# Skill: ${content.name}`,
          "",
          content.content.trim(),
          "",
          content.directory ? `Base directory for this skill: ${content.directory}` : "",
          `</skill_content>`,
        ]
          .filter(Boolean)
          .join("\n");

        return ok(output);
      }

      // Fallback: return basic skill info
      return ok(
        `<skill_content name="${skill.name}">\n# Skill: ${skill.name}\n\n${skill.description}\n</skill_content>`,
      );
    },
  });
}
