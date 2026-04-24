/**
 * WriteTool — Write content to a file on the local filesystem.
 *
 * Creates parent directories if they don't exist. Overwrites existing files.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import * as path from "path";
import { createTool, loadDescription, ok, fail } from "./create-tool.js";
import type { Tool } from "../types/index.js";

const DESCRIPTION = loadDescription(import.meta.url, "write.txt");

export function createWriteTool(): Tool {
  return createTool({
    name: "write",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "The absolute path to the file to write (must be absolute, not relative)",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["filePath", "content"],
    },
    execute: async (args) => {
      const filePath = args.filePath as string;
      const content = args.content as string;

      if (!filePath) return fail("filePath is required");
      if (content === undefined || content === null) return fail("content is required");

      const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);

      try {
        const dir = path.dirname(resolved);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        const existed = existsSync(resolved);
        writeFileSync(resolved, content, "utf-8");

        return ok(
          existed
            ? `Wrote file successfully (overwritten): ${resolved}`
            : `Wrote file successfully (created): ${resolved}`,
        );
      } catch (err: unknown) {
        return fail(`Failed to write file: ${(err as Error).message}`);
      }
    },
  });
}
