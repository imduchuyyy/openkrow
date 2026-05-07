import { resolve, join } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import type { FileEntry } from "../shared/types";

/**
 * Provides filesystem operations for the file explorer and viewer.
 */
export class FileService {
  /**
   * List files and directories at the given path.
   * Hides dotfiles, sorts directories first then alphabetical.
   */
  static async listFiles(dirPath: string): Promise<FileEntry[]> {
    const resolved = resolve(dirPath);
    const entries = await readdir(resolved, { withFileTypes: true });

    return entries
      .filter((e) => !e.name.startsWith("."))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((e) => ({
        name: e.name,
        path: join(resolved, e.name),
        type: e.isDirectory() ? "directory" as const : "file" as const,
      }));
  }

  /**
   * Read file content. Rejects files larger than 512KB.
   */
  static async readFile(filePath: string): Promise<{ content: string; path: string }> {
    const resolved = resolve(filePath);
    const s = await stat(resolved);
    if (s.size > 1024 * 512) {
      throw new Error("File too large (>512KB)");
    }
    const content = await readFile(resolved, "utf-8");
    return { content, path: resolved };
  }
}
