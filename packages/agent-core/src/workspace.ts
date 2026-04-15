/**
 * WorkspaceManager — Manages per-project .krow/ directories and
 * global conversation indexing.
 *
 * Directory structure:
 *   project-dir/
 *   ├── .krow/
 *   │   ├── context.json       # Project summary, key facts, conventions
 *   │   ├── memories.json      # Persistent cross-conversation facts
 *   │   ├── conversations/     # Per-conversation JSON files
 *   │   └── skills/            # Workspace-local skill overrides
 *
 * Global index at: ~/.config/openkrow/conversations/index.json
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import type {
  IWorkspaceManager,
  Workspace,
  WorkspaceContext,
  Memory,
  ConversationSummary,
  PersistedConversation,
  GlobalConversationIndex,
} from "./types.js";

const KROW_DIR = ".krow";
const CONTEXT_FILE = "context.json";
const MEMORIES_FILE = "memories.json";
const CONVERSATIONS_DIR = "conversations";
const SKILLS_DIR = "skills";

const GLOBAL_CONFIG_DIR = join(homedir(), ".config", "openkrow");
const GLOBAL_CONVERSATIONS_DIR = join(GLOBAL_CONFIG_DIR, "conversations");
const GLOBAL_INDEX_FILE = join(GLOBAL_CONVERSATIONS_DIR, "index.json");

/** Default empty workspace context. */
function defaultContext(dir: string): WorkspaceContext {
  return {
    projectName: basename(dir),
    summary: "",
    techStack: [],
    conventions: [],
    keyFiles: [],
  };
}

/**
 * Slugify a string for use as a filename.
 * "Fix the login bug" -> "fix-the-login-bug"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Safely read and parse a JSON file, returning null if it doesn't exist.
 */
async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Write a JSON file (pretty-printed).
 */
async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export class WorkspaceManager implements IWorkspaceManager {
  private workspace: Workspace | null = null;
  private workspaceDir: string | null = null;

  async init(dir: string): Promise<Workspace> {
    const krowPath = join(dir, KROW_DIR);

    // Create directory structure
    await mkdir(krowPath, { recursive: true });
    await mkdir(join(krowPath, CONVERSATIONS_DIR), { recursive: true });
    await mkdir(join(krowPath, SKILLS_DIR), { recursive: true });

    // Create initial files
    const context = defaultContext(dir);
    await writeJsonFile(join(krowPath, CONTEXT_FILE), context);
    await writeJsonFile(join(krowPath, MEMORIES_FILE), []);

    // Ensure global conversations directory exists
    await mkdir(GLOBAL_CONVERSATIONS_DIR, { recursive: true });

    this.workspace = {
      path: dir,
      context,
      memories: [],
      conversations: [],
    };
    this.workspaceDir = dir;

    return this.workspace;
  }

  async load(dir: string): Promise<Workspace> {
    const krowPath = join(dir, KROW_DIR);

    if (!existsSync(krowPath)) {
      // Auto-init if .krow/ doesn't exist
      return this.init(dir);
    }

    const context =
      (await readJsonFile<WorkspaceContext>(join(krowPath, CONTEXT_FILE))) ??
      defaultContext(dir);

    const memories =
      (await readJsonFile<Memory[]>(join(krowPath, MEMORIES_FILE))) ?? [];

    const conversations = await this.scanConversations(krowPath);

    this.workspace = {
      path: dir,
      context,
      memories,
      conversations,
    };
    this.workspaceDir = dir;

    return this.workspace;
  }

  getContext(): WorkspaceContext {
    if (!this.workspace) {
      return defaultContext(process.cwd());
    }
    return this.workspace.context;
  }

  async addMemory(
    partial: Omit<Memory, "id" | "createdAt">
  ): Promise<Memory> {
    if (!this.workspace || !this.workspaceDir) {
      throw new Error("No workspace loaded");
    }

    const memory: Memory = {
      ...partial,
      id: randomUUID(),
      createdAt: Date.now(),
    };

    this.workspace.memories.push(memory);

    const krowPath = join(this.workspaceDir, KROW_DIR);
    await writeJsonFile(
      join(krowPath, MEMORIES_FILE),
      this.workspace.memories
    );

    return memory;
  }

  getMemories(): Memory[] {
    return this.workspace?.memories ?? [];
  }

  async listConversations(): Promise<ConversationSummary[]> {
    if (!this.workspaceDir) {
      return [];
    }
    const krowPath = join(this.workspaceDir, KROW_DIR);
    return this.scanConversations(krowPath);
  }

  async loadConversation(id: string): Promise<PersistedConversation> {
    if (!this.workspaceDir) {
      throw new Error("No workspace loaded");
    }

    const convPath = join(
      this.workspaceDir,
      KROW_DIR,
      CONVERSATIONS_DIR,
      `${id}.json`
    );
    const conversation = await readJsonFile<PersistedConversation>(convPath);

    if (!conversation) {
      throw new Error(`Conversation "${id}" not found`);
    }

    return conversation;
  }

  async saveConversation(conversation: PersistedConversation): Promise<void> {
    if (!this.workspaceDir) {
      throw new Error("No workspace loaded");
    }

    const convDir = join(
      this.workspaceDir,
      KROW_DIR,
      CONVERSATIONS_DIR
    );
    await mkdir(convDir, { recursive: true });

    const convPath = join(convDir, `${conversation.id}.json`);
    await writeJsonFile(convPath, conversation);

    // Update global index
    await this.updateGlobalIndex(conversation);
  }

  getPath(): string | null {
    return this.workspaceDir;
  }

  isLoaded(): boolean {
    return this.workspace !== null;
  }

  /**
   * Update the workspace context (e.g., after background model generates it).
   */
  async updateContext(context: WorkspaceContext): Promise<void> {
    if (!this.workspace || !this.workspaceDir) {
      throw new Error("No workspace loaded");
    }

    this.workspace.context = context;
    const krowPath = join(this.workspaceDir, KROW_DIR);
    await writeJsonFile(join(krowPath, CONTEXT_FILE), context);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async scanConversations(
    krowPath: string
  ): Promise<ConversationSummary[]> {
    const convDir = join(krowPath, CONVERSATIONS_DIR);

    if (!existsSync(convDir)) {
      return [];
    }

    try {
      const files = await readdir(convDir);
      const summaries: ConversationSummary[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const conv = await readJsonFile<PersistedConversation>(
          join(convDir, file)
        );
        if (conv) {
          summaries.push({
            id: conv.id,
            title: conv.title,
            startedAt: conv.startedAt,
            lastActiveAt: conv.lastActiveAt,
            turns: conv.turns,
          });
        }
      }

      // Sort by most recent first
      summaries.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
      return summaries;
    } catch {
      return [];
    }
  }

  private async updateGlobalIndex(
    conversation: PersistedConversation
  ): Promise<void> {
    await mkdir(GLOBAL_CONVERSATIONS_DIR, { recursive: true });

    const index =
      (await readJsonFile<GlobalConversationIndex>(GLOBAL_INDEX_FILE)) ?? {
        conversations: [],
      };

    // Update or add entry
    const existing = index.conversations.findIndex(
      (c) => c.id === conversation.id
    );
    const entry = {
      id: conversation.id,
      title: conversation.title,
      workspacePath: conversation.workspacePath,
      startedAt: conversation.startedAt,
      lastActiveAt: conversation.lastActiveAt,
      turns: conversation.turns,
    };

    if (existing >= 0) {
      index.conversations[existing] = entry;
    } else {
      index.conversations.push(entry);
    }

    await writeJsonFile(GLOBAL_INDEX_FILE, index);
  }

  /**
   * Generate a unique conversation ID from the first user message.
   * Slugifies the message and appends -2, -3, etc. on collision.
   */
  static generateConversationId(
    firstMessage: string,
    existingIds: string[]
  ): string {
    const base = slugify(firstMessage) || "conversation";
    let candidate = base;
    let counter = 2;

    while (existingIds.includes(candidate)) {
      candidate = `${base}-${counter}`;
      counter++;
    }

    return candidate;
  }
}
