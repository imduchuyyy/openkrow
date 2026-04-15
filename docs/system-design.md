# OpenKrow System Architecture

> **Version:** 0.1.0-draft
> **Last updated:** 2026-04-15
> **Status:** Design phase

---

## 1. Vision

OpenKrow is a **general-purpose agentic operating system** that runs in the terminal. It is not a coding assistant -- coding is one skill among many. OpenKrow helps users with any task that can be decomposed into tool calls: writing presentations, authoring documents, running scripts, researching topics, managing infrastructure, and anything else that can be extended through skills and MCP servers.

The closest analogy is a personal terminal-native AI that knows who you are, understands the project you're working in, remembers what you discussed yesterday, and can learn new abilities on demand.

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          User (Terminal)                             │
│                                                                      │
│  openkrow chat    openkrow run "..."    openkrow config              │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         CLI Layer (apps/openkrow)                     │
│                                                                      │
│  Commander parser  ──  Session REPL  ──  TUI renderer                │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Orchestrator (OpenKrow)                        │
│                                                                      │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Config   │  │  Workspace │  │  Router  │  │  Skill Manager    │  │
│  │  Loader   │  │  Manager   │  │ (model)  │  │  (local + MCP)    │  │
│  └──────────┘  └────────────┘  └──────────┘  └───────────────────┘  │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Agent Runtime (agent-core)                     │
│                                                                      │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────────────┐ │
│  │    Agent      │  │  Context Mgr   │  │    Tool Registry         │ │
│  │  (run loop)   │  │  (budget,      │  │  (builtin + skill tools) │ │
│  │              │  │   compaction,   │  │                          │ │
│  │              │  │   memories)     │  │                          │ │
│  └──────────────┘  └────────────────┘  └──────────────────────────┘ │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     LLM Provider Layer (@openkrow/ai)                │
│                                                                      │
│    OpenAI    │    Anthropic    │    Google    │   (custom/local)      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Storage Layout

There are two storage domains: **global** (per-user) and **workspace** (per-project directory).

### 3.1 Global Store: `~/.config/openkrow/`

```
~/.config/openkrow/
├── config.json              # User settings (provider, model, keys, etc.)
├── profile/
│   └── personality.json     # Learned user personality profile
├── skills/
│   ├── registry.json        # Installed skills manifest
│   └── <skill-name>/        # Skill definition files (SKILL.md, etc.)
├── conversations/
│   └── index.json           # Global index: maps workspace paths -> conversation IDs
└── models/
    └── routing.json         # Smart routing rules (which model for what task)
```

**Design rules:**
- `config.json` stores settings only, never secrets. API keys live in env vars.
- `personality.json` is written by the personality extraction agent, never by the user directly.
- `registry.json` tracks all installed skills across workspaces.
- `index.json` enables cross-workspace conversation search.

### 3.2 Workspace Store: `.krow/`

Created automatically the first time `openkrow` is run in a directory.

```
project-dir/
├── .krow/
│   ├── context.json         # Workspace context: project summary, key facts, conventions
│   ├── memories.json        # Agent memories: important decisions, user corrections, learned facts
│   ├── conversations/
│   │   ├── <slug>.json      # Individual conversation (auto-named from first message)
│   │   └── ...
│   └── skills/              # Workspace-local skill overrides or custom skills
│       └── ...
└── (user's project files)
```

**Design rules:**
- `.krow/` should be added to `.gitignore` by default (contains personal context).
- `context.json` is a condensed summary of the workspace that gets injected into every system prompt.
- `memories.json` stores persistent facts that survive across conversations ("user prefers tabs over spaces", "the deploy target is AWS us-east-1").
- Conversations are named by slugifying the first user message: "Fix the login bug" -> `fix-the-login-bug.json`.

---

## 4. Core Subsystems

### 4.1 Config Loader

**Location:** `packages/agent-core` (or `apps/openkrow/src/config/`)

Resolves configuration from multiple sources with a clear precedence order:

```
defaults < config.json < env vars < CLI flags
```

```typescript
interface OpenKrowConfig {
  provider: "openai" | "anthropic" | "google";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens: number;
  temperature: number;
  enableTools: boolean;
  enableStreaming: boolean;
  maxTurns: number;
  systemPrompt?: string;
  routing?: ModelRoutingConfig;   // smart routing rules
}
```

### 4.2 Workspace Manager

**Location:** `packages/agent-core` (new module)

Responsible for initializing, loading, and persisting workspace state.

```typescript
interface WorkspaceManager {
  /** Initialize .krow/ in the current directory if it doesn't exist */
  init(dir: string): Promise<Workspace>;

  /** Load an existing workspace from a directory */
  load(dir: string): Promise<Workspace>;

  /** Get the workspace context summary for system prompt injection */
  getContext(): WorkspaceContext;

  /** Save a memory to the workspace */
  addMemory(memory: Memory): Promise<void>;

  /** List past conversations */
  listConversations(): Promise<ConversationSummary[]>;

  /** Load a specific conversation */
  loadConversation(id: string): Promise<Conversation>;

  /** Save the current conversation */
  saveConversation(conversation: Conversation): Promise<void>;
}
```

```typescript
interface Workspace {
  path: string;                    // absolute path to the project directory
  context: WorkspaceContext;       // project summary, conventions, key facts
  memories: Memory[];              // persistent facts
  conversations: ConversationSummary[];  // past sessions (id + title + timestamp)
}

interface WorkspaceContext {
  projectName: string;
  summary: string;                 // one-paragraph project description
  techStack: string[];             // detected or user-specified
  conventions: string[];           // "uses tabs", "prefers functional style", etc.
  keyFiles: string[];              // important files the agent should know about
}

interface Memory {
  id: string;
  content: string;                 // the fact or decision
  source: "agent" | "user";       // who created this memory
  createdAt: number;
  tags: string[];
}
```

**Init flow (first run):**
1. Detect that `.krow/` doesn't exist.
2. Create the directory structure.
3. Run a quick scan of the project (package.json, README, file tree).
4. Generate an initial `context.json` from the scan.
5. Print a message: "Workspace initialized in .krow/".

### 4.3 Context Manager

**Location:** `packages/agent-core` (new module)

The Context Manager is the brain's working memory. It decides what information gets sent to the LLM on each turn, given a finite token budget.

**Strategy: Sliding window + summary**

```
┌──────────────────────────────────────────────────────────┐
│                   SYSTEM PROMPT                           │
│  Base instructions + workspace context + user personality │
│  + active skill descriptions                              │
│  (always present, ~1000-2000 tokens)                      │
├──────────────────────────────────────────────────────────┤
│                   SUMMARY BLOCK                           │
│  Compressed summary of older conversation turns           │
│  (auto-generated when window overflows)                   │
│  (~500-1000 tokens)                                       │
├──────────────────────────────────────────────────────────┤
│                   CACHED SECTION                          │
│  Frequently referenced context that doesn't change:       │
│  - workspace memories                                     │
│  - pinned file contents                                   │
│  (uses provider cache APIs where available)               │
├──────────────────────────────────────────────────────────┤
│                   ACTIVE CONVERSATION                     │
│  Recent messages in full (sliding window)                 │
│  Grows until budget exceeded, then compaction triggers    │
├──────────────────────────────────────────────────────────┤
│                   TOOL DEFINITIONS                        │
│  Builtin tools + active skill tools                       │
│  (~100-200 tokens per tool)                               │
└──────────────────────────────────────────────────────────┘
```

```typescript
interface ContextManager {
  /** Set the total token budget for this session */
  setBudget(maxTokens: number): void;

  /** Get the current token usage breakdown */
  getUsage(): ContextBudget;

  /** Build the full message array for the next LLM call */
  buildMessages(): ChatMessage[];

  /** Add a new message to the active conversation */
  addMessage(message: AgentMessage): void;

  /** Pin content to the cached section (e.g., a key file) */
  pinToCache(key: string, content: string): void;

  /** Remove pinned content */
  unpinFromCache(key: string): void;

  /** Force compaction of the active conversation */
  compact(): Promise<void>;

  /** Inject workspace context and personality into the system prompt */
  setSystemContext(context: WorkspaceContext, personality: UserPersonality): void;
}

interface ContextBudget {
  total: number;                   // max tokens for the context window
  system: number;                  // tokens used by system prompt
  summary: number;                 // tokens used by summary block
  cached: number;                  // tokens used by cached/pinned content
  conversation: number;            // tokens used by active messages
  tools: number;                   // tokens used by tool definitions
  available: number;               // remaining tokens for the response
}
```

**Auto-compaction trigger:**
When `conversation` tokens exceed 60% of `total`, the Context Manager:
1. Takes all messages except the last N turns (configurable, default 4).
2. Sends them to a cheap/fast model with the prompt: "Summarize this conversation so far, preserving key decisions, file paths mentioned, and the current task state."
3. Replaces those messages with the summary block.
4. Emits a `context:compacted` event so the UI can indicate this.

### 4.4 Agent Runtime

**Location:** `packages/agent-core`

The core agent loop. This is the existing `Agent` class, extended with the Context Manager and workspace awareness.

```
User message
     │
     ▼
┌─────────────┐     ┌──────────────┐
│ Context Mgr │────▶│  Build msgs  │
│ addMessage() │     │  (budget-    │
└─────────────┘     │   aware)     │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  LLM Call    │──── (via Router)
                    │  (chat or    │
                    │   stream)    │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
         Text response            Tool calls
              │                         │
              ▼                         ▼
         Return to user          ┌──────────────┐
                                 │ Tool Registry │
                                 │  .execute()   │
                                 └──────┬───────┘
                                        │
                                        ▼
                                 Tool results added
                                 to Context Mgr
                                        │
                                        ▼
                                 Loop back to LLM
                                 (until no tool calls
                                  or max turns)
```

**Key changes from current implementation:**
- `Agent` no longer builds messages directly -- it delegates to `ContextManager`.
- `Agent` no longer creates `LLMClient` directly -- it uses the `Router`.
- The `ConversationState` class is absorbed into `ContextManager` (which handles both state and budget).

### 4.5 Model Router

**Location:** `packages/ai` (new module)

Routes LLM requests to the appropriate provider/model based on the task type.

```typescript
interface ModelRouter {
  /** Route a standard chat/tool-use request to the primary model */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /** Route a streaming request */
  stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<StreamEvent>;

  /** Route a background task to a cheap model */
  background(task: BackgroundTask): Promise<string>;
}

type BackgroundTask =
  | { type: "summarize"; content: string }
  | { type: "extract_personality"; conversations: string[] }
  | { type: "generate_title"; firstMessage: string }
  | { type: "generate_context"; fileTree: string; readme: string };

interface ModelRoutingConfig {
  primary: { provider: string; model: string };          // main model for user tasks
  background: { provider: string; model: string };       // cheap model for summaries, extraction
}
```

**Default routing:**
| Task | Default Model |
|------|--------------|
| User chat / tool use | User's configured primary model |
| Conversation summary (compaction) | Background model (e.g., `gpt-4o-mini`, `claude-3-5-haiku`) |
| Personality extraction | Background model |
| Conversation title generation | Background model |
| Workspace context generation | Background model |

### 4.6 Tool Registry & Builtin Tools

**Location:** `packages/agent-core` (registry) + `apps/openkrow` (builtins)

The tool registry is the existing `ToolRegistry` class. The builtin tool set is redesigned for general-purpose use:

| Tool | Description | Category |
|------|------------|----------|
| `bash` | Execute shell commands | System |
| `read_file` | Read file contents with line numbers | Filesystem |
| `write_file` | Create or overwrite files | Filesystem |
| `edit_file` | Surgical string replacement in files | Filesystem |
| `list_files` | Glob-based file listing | Filesystem |
| `grep` | Regex search across files | Filesystem |
| `web_search` | Search the web (via provider API) | Web |
| `web_fetch` | Fetch and parse a URL | Web |
| `question` | Ask the user a clarifying question with structured options | Interaction |
| `todo` | Create and manage a task list for the current session | Planning |

```typescript
// The `question` tool -- lets the agent ask the user for clarification
const questionTool: Tool = {
  definition: {
    name: "question",
    description: "Ask the user a question to clarify their intent. Can present multiple-choice options or free-form input.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to ask" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              description: { type: "string" }
            }
          },
          description: "Optional choices to present"
        },
        multiple: { type: "boolean", description: "Allow selecting multiple options" }
      },
      required: ["question"]
    }
  },
  async execute(args) {
    // Implementation delegates to the TUI layer to render the question
    // and waits for user input before returning
  }
};
```

### 4.7 Skill Manager

**Location:** `packages/agent-core` (new module)

Skills extend the agent's capabilities. Two types are supported:

#### Local Skill Files

A skill is a directory containing a `SKILL.md` file that describes tools, prompts, and resources. The format follows the structure used by Anthropic's Claude tooling ecosystem.

```
~/.config/openkrow/skills/
└── google-docs/
    ├── SKILL.md              # Skill definition (name, description, tools, prompts)
    ├── tools/
    │   ├── create-doc.json   # Tool definition (JSON Schema)
    │   └── edit-doc.json
    └── resources/
        └── templates/        # Static resources the skill can reference
```

**SKILL.md format:**
```markdown
# Google Docs

Create and edit Google Docs from the terminal.

## Tools

- create_doc: Create a new Google Doc with the given title and content.
- edit_doc: Edit an existing Google Doc by ID.

## Setup

Requires GOOGLE_DOCS_API_KEY environment variable.
```

#### MCP Server Connections

Skills can also be MCP (Model Context Protocol) servers -- external processes that expose tools, prompts, and resources over stdio or HTTP.

```typescript
interface SkillManager {
  /** List all installed skills */
  list(): Skill[];

  /** Install a skill from a path or registry */
  install(source: string): Promise<Skill>;

  /** Uninstall a skill */
  uninstall(name: string): Promise<void>;

  /** Connect to an MCP server */
  connectMCP(config: MCPServerConfig): Promise<Skill>;

  /** Get all tool definitions from all active skills */
  getToolDefinitions(): ToolDefinition[];

  /** Execute a tool from a skill */
  executeTool(skillName: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
}

interface Skill {
  name: string;
  description: string;
  type: "local" | "mcp";
  tools: ToolDefinition[];
  enabled: boolean;
}

interface MCPServerConfig {
  name: string;
  command: string;           // for stdio servers
  args?: string[];
  url?: string;              // for HTTP servers
  env?: Record<string, string>;
}
```

### 4.8 User Personality System

**Location:** `packages/agent-core` (new module)

The personality system learns about the user from their interactions and adapts the agent's behavior accordingly.

**Storage:** `~/.config/openkrow/profile/personality.json`

```typescript
interface UserPersonality {
  /** Overall communication style preferences */
  communicationStyle: {
    verbosity: "concise" | "moderate" | "detailed";
    formality: "casual" | "neutral" | "formal";
    explanationDepth: "minimal" | "moderate" | "thorough";
  };

  /** Technical preferences */
  technical: {
    expertiseLevel: "beginner" | "intermediate" | "advanced" | "expert";
    preferredLanguages: string[];
    preferredTools: string[];
    codingStyle: string[];           // "functional", "uses-semicolons", "prefers-const", etc.
  };

  /** Behavioral observations */
  observations: string[];            // free-form learned facts
                                      // "prefers to see diffs before applying changes"
                                      // "likes to be asked before destructive operations"
                                      // "often works on TypeScript monorepos"

  /** Metadata */
  lastUpdated: number;
  sessionsAnalyzed: number;
  version: number;
}
```

**Extraction flow:**

```
Session ends (10+ turns)
        │
        ▼
  sessionsAnalyzed++ ; if (sessionsAnalyzed % N === 0):
        │
        ▼
  Load last N unanalyzed conversations
        │
        ▼
  Send to background model with extraction prompt:
  "Analyze these conversations and extract/update
   the user's personality profile. Preserve existing
   observations, add new ones, resolve conflicts."
        │
        ▼
  Merge result into personality.json
```

The personality is injected into the system prompt as a "User Context" section:

```
## User Context
- Communication: concise, casual
- Expertise: advanced TypeScript developer
- Preferences: prefers functional style, uses strict TS, likes detailed error messages
- Observations: often works on monorepos, prefers seeing diffs before edits
```

---

## 5. Data Flow: Complete Request Lifecycle

```
1. User types: "Create a presentation about our Q4 results"
                    │
2. CLI layer receives input
                    │
3. Orchestrator:
   ├── WorkspaceManager.getContext()     -> workspace summary
   ├── PersonalityLoader.load()          -> user profile
   ├── SkillManager.getToolDefinitions() -> skill tools
   └── ContextManager.addMessage(user)
                    │
4. ContextManager.buildMessages():
   ├── System prompt + workspace context + personality
   ├── Summary block (if conversation was compacted)
   ├── Cached/pinned content
   ├── Active conversation (sliding window)
   └── Tool definitions (builtin + skills)
                    │
5. Router.chat(messages) -> routes to primary model
                    │
6. LLM responds with tool calls:
   [{ name: "question", args: { question: "What format?", options: [...] } }]
                    │
7. Agent executes tool -> TUI renders question -> user answers
                    │
8. Tool result added to ContextManager -> loop back to step 4
                    │
9. LLM responds with more tool calls:
   [{ name: "write_file", args: { path: "q4-results.pptx.md", content: "..." } }]
                    │
10. Agent executes tool -> file written
                     │
11. LLM responds with text (no tool calls) -> final response
                     │
12. Orchestrator:
    ├── ContextManager persists conversation to .krow/conversations/
    ├── Update global index
    └── If session substantial, check personality extraction trigger
```

---

## 6. Package Responsibilities (Revised)

### `@openkrow/ai`
The LLM abstraction layer. Provider-agnostic interface for chat, streaming, and model listing. Also contains the **Model Router** for smart routing.

| Module | Responsibility |
|--------|---------------|
| `types.ts` | Core types: ChatMessage, ChatResponse, StreamEvent, ToolDefinition |
| `client.ts` | LLMClient factory |
| `router.ts` | **NEW** - Smart model routing based on task type |
| `providers/` | OpenAI, Anthropic, Google implementations |

### `@openkrow/agent-core`
The agent runtime. Owns the run loop, context management, tool execution, workspace management, skill integration, and personality system.

| Module | Responsibility |
|--------|---------------|
| `agent.ts` | Core run loop (LLM call -> tool execution -> loop) |
| `context.ts` | **NEW** - Context Manager (budget, compaction, sliding window) |
| `workspace.ts` | **NEW** - Workspace init, load, persist (.krow/) |
| `skills.ts` | **NEW** - Skill Manager (local files + MCP connections) |
| `personality.ts` | **NEW** - Personality loader and extraction trigger |
| `tools.ts` | Tool Registry |
| `types.ts` | All shared types |

### `@openkrow/tui`
Terminal UI components. Used by the CLI layer for rendering chat, questions, spinners, progress.

### `@openkrow/app` (apps/openkrow)
The main user-facing CLI application. Thin layer that wires together all packages.

| Module | Responsibility |
|--------|---------------|
| `cli.ts` | Commander-based CLI parser |
| `commands/` | Command handlers (chat, run, config, skills) |
| `tools.ts` | Builtin tool implementations (bash, read, write, web, question, todo) |
| `config/` | Config file loading |

---

## 7. Workspace Initialization Flow

```
$ cd ~/projects/my-app
$ openkrow

   Is .krow/ present?
         │
    ┌────┴────┐
    No        Yes
    │          │
    ▼          ▼
  Create     Load
  .krow/     .krow/context.json
    │        .krow/memories.json
    ▼
  Scan project:
  - Read package.json / Cargo.toml / etc.
  - Read README.md (first 200 lines)
  - List top-level file tree
    │
    ▼
  Send to background model:
  "Generate a project context summary"
    │
    ▼
  Write .krow/context.json
  Write .krow/memories.json (empty)
  Write .krow/conversations/ (empty dir)
    │
    ▼
  Print: "Workspace initialized."
  Start interactive session.
```

---

## 8. Conversation Persistence

Each conversation is stored as a JSON file in `.krow/conversations/`.

**Naming:** Auto-generated from the first user message.
- "Fix the login bug" -> `fix-the-login-bug.json`
- "Create a presentation about Q4" -> `create-a-presentation-about-q4.json`
- Collisions appended with `-2`, `-3`, etc.

```typescript
interface PersistedConversation {
  id: string;
  title: string;                   // human-readable, from first message
  workspacePath: string;
  messages: AgentMessage[];
  summaryBlocks: string[];         // compaction summaries generated during the session
  memories: Memory[];              // memories created during this conversation
  startedAt: number;
  lastActiveAt: number;
  turns: number;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
}
```

**Global index** at `~/.config/openkrow/conversations/index.json`:

```typescript
interface GlobalConversationIndex {
  conversations: Array<{
    id: string;
    title: string;
    workspacePath: string;
    startedAt: number;
    lastActiveAt: number;
    turns: number;
  }>;
}
```

This enables searching conversations across workspaces: "What did I decide about the database schema last week?"

---

## 9. Smart Routing Configuration

```json
{
  "primary": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514"
  },
  "background": {
    "provider": "anthropic",
    "model": "claude-3-5-haiku-20241022"
  }
}
```

The router automatically selects the model:

| Operation | Model Used | Reason |
|-----------|-----------|--------|
| User chat / tool calls | primary | Needs strongest reasoning |
| Context compaction (summary) | background | Mechanical task, save cost |
| Personality extraction | background | Runs offline, doesn't need top quality |
| Conversation title | background | Single sentence generation |
| Workspace context generation | background | One-time scan summary |

---

## 10. Skill System Deep Dive

### Skill Discovery & Installation

```
$ openkrow
❯ /skills install google-docs

  Searching skill registry...
  Found: google-docs v1.2.0 - Create and edit Google Docs
  Installing to ~/.config/openkrow/skills/google-docs/
  Done. 2 new tools available: create_doc, edit_doc
```

### Skill Lifecycle

```
                  ┌─────────────┐
   install ──────▶│  Downloaded  │
                  │  to skills/  │
                  └──────┬──────┘
                         │
                    load SKILL.md
                    parse tools
                         │
                  ┌──────▼──────┐
                  │   Loaded    │  tools registered
                  │   & Active  │  in ToolRegistry
                  └──────┬──────┘
                         │
                  ┌──────▼──────┐
                  │   Disabled  │  user can toggle
                  └──────┬──────┘
                         │
                  ┌──────▼──────┐
                  │ Uninstalled │  removed from disk
                  └─────────────┘
```

### MCP Server Integration

For MCP servers, the Skill Manager:
1. Spawns the server process (stdio) or connects via HTTP.
2. Sends `initialize` to negotiate capabilities.
3. Calls `tools/list` to discover available tools.
4. Registers those tools in the ToolRegistry with a `skill:` prefix.
5. When the agent calls a skill tool, the Skill Manager forwards the call to the MCP server.
6. On shutdown, sends `shutdown` + `exit` to clean up.

---

## 11. Security Model

| Concern | Approach |
|---------|----------|
| API keys | Never persisted to config files. Always from env vars. |
| File access | Agent has full autonomy -- no confirmation prompts. |
| Bash execution | Full autonomy. Agent decides what to run. |
| MCP servers | Sandboxed by OS process isolation. Skills declare required permissions. |
| Personality data | Stored locally only. Never sent to any service except the LLM. |
| `.krow/` | Added to `.gitignore` suggestions. Contains personal context. |

---

## 12. Future Considerations

These are explicitly **out of scope** for v0.1 but the architecture should not preclude them:

- **Multi-agent orchestration:** One agent delegates subtasks to specialized agents.
- **Web UI:** The `@openkrow/web-ui` package already exists and can be wired up later.
- **Team workspaces:** Shared workspace context across a team.
- **Persistent background agents:** Long-running agents that watch for events (file changes, CI results).
- **GPU pod integration:** The `@openkrow/pods` package enables self-hosted model deployments.

---

## 13. Monorepo Package Map

```
openkrow/
├── packages/
│   ├── ai/                  # LLM abstraction + model router
│   ├── agent-core/          # Agent runtime, context mgr, workspace, skills, personality
│   ├── tui/                 # Terminal UI components
│   ├── web-ui/              # Web components (future)
│   └── pods/                # GPU pod management (future)
├── apps/
│   ├── openkrow/            # Main CLI app (user entry point)
│   ├── coding-agent/        # Legacy coding-only agent (to be merged into openkrow)
│   └── mom/                 # Slack bot integration
├── docs/
│   └── system-design.md     # This document
└── examples/
    └── tui-demo.ts          # TUI component demo
```
