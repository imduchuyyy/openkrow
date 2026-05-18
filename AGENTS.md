# AGENTS.md

## Overview

OpenKrow is a desktop AI app that gives solo founders a team of 5 specialized agents. Built with **Electrobun** (Bun-native desktop framework), it wraps an **opencode** server via `@opencode-ai/sdk/v2` and renders a React 19 webview with real-time streaming.

## Architecture

Three processes communicate via Electrobun's typed RPC:

- **Bun process** (`bun/`): Spawns opencode server, manages multi-agent sessions, streams events
  - `index.ts` — entry point, manages app menu and settings window lifecycle
  - `workspace.ts` — opencode server lifecycle, session CRUD, question reply/reject, provider auth
  - `stream.ts` — SSE event bridge with user message filtering and real-time part streaming
  - `rpc.ts` — main window RPC handler definitions, idempotent `initWorkspace`
  - `settings-rpc.ts` — settings window RPC handler (provider operations)
  - `preferences.ts` — user preferences stored at `~/.openkrow/preferences.json`
  - `agents/` — multi-agent definitions and metadata
    - `index.ts` — exports all agents + `agentMeta` array (name, label, color, description)
    - `founder.ts` — cofounder agent (default, strategy & coordination)
    - `marketing.ts` — marketing agent (content, campaigns, social)
    - `development.ts` — development agent (code, features, bugs)
    - `legal.ts` — legal agent (contracts, compliance, policies)
    - `finance.ts` — finance agent (expenses, invoices, forecasts)
    - `operations.ts` — operations agent (email, scheduling, support)
- **Main webview** (`mainview/`): React 19 + Tailwind v4 chat UI
  - `rpc.ts` — webview-side RPC + event emitter
  - `App.tsx` — state machine: workspace-setup → loading → ready, manages agents/sessions/messages
  - `components/Sidebar.tsx` — agent selection, session history (grouped by date), new session
  - `components/ChatInput.tsx` — chat input with embedded model selector
  - `components/MessageList.tsx` — message rendering with markdown/tools
  - `components/QuestionPrompt.tsx` — question tool UI
  - `components/WorkspaceSetup.tsx` — first-run workspace directory picker
  - `components/SessionHistory.tsx` — session history dropdown
- **Settings webview** (`settingsview/`): Separate native window for settings
  - `App.tsx` — settings UI with Providers tab
  - `rpc.ts` — settings-side RPC using `SettingsRPCSchema`
- **Shared** (`shared/types.ts`): RPC schema types (`KrowRPCSchema`, `SettingsRPCSchema`), `AgentInfo`

## Multi-agent system

Six agents, each with a dedicated prompt in `prompts/`:

| Agent | File | Color | Role |
|-------|------|-------|------|
| cofounder | `prompts/cofounder.txt` | #3B82F6 | Strategy, coordination, high-level decisions |
| marketing | `prompts/marketing.txt` | #F97316 | Content, campaigns, social media, SEO |
| development | `prompts/development.txt` | #10B981 | Code, features, bugs, documentation |
| legal | `prompts/legal.txt` | #8B5CF6 | Contracts, compliance, policies, agreements |
| finance | `prompts/finance.txt` | #06B6D4 | Expenses, invoices, forecasts, reports |
| operations | `prompts/operations.txt` | #6B7280 | Email, scheduling, support, task management |

The active agent is selected in the Sidebar and passed to `session.promptAsync({ agent })`. The default agent is `"cofounder"`.

## Event streaming

`bun/stream.ts` bridges opencode SSE events to the webview:

- **User message filtering** — `userMessageIds` set tracks non-assistant messages; their parts are rejected
- **Real-time streaming** — parts for unknown messages are forwarded immediately (assumed assistant), enabling word-by-word output
- **Role confirmation** — `message.updated` with `role: "assistant"` confirms the message; non-assistant messages are tracked for rejection
- **Agent tracking** — `messageAgentMap` tracks which agent produced each message; UI shows agent name/color

Event types handled: `message.updated`, `message.completed`, `message.part.updated`, `session.status`, `session.error`, `question.asked`

## Settings window

Settings is a **separate native window** (not a modal), opened via:
- **Cmd+,** keyboard shortcut (app menu accelerator)
- Settings gear icon in the Sidebar (sends `openSettings` RPC)

Key implementation details:
- `openSettingsWindow()` in `bun/index.ts` creates a new `BrowserWindow` with its own RPC handler
- `viewsRoot` is captured at startup (before `process.chdir()`) to ensure `views://` URLs resolve correctly
- The settings window is destroyed on close; a new one is created each time
- Cleanup (`workspace.stop()`) only runs when the **main window** closes (by ID check)

### Provider auth flow
- Providers have `authMethods` (type `"api"` or `"oauth"`) with optional dynamic `prompts`
- `prompts` can have conditional visibility via `when: { key, op, value }` clauses
- If an API method has no prompts, a fallback API key input is shown
- OAuth flow: `startProviderOAuth` → opens browser → user pastes code → `completeProviderOAuth`
- UI uses **optimistic updates** — provider `connected` state updates immediately

### Settings ↔ Main window sync
- After any mutation, settings RPC calls `rpc.send.settingsChanged({})` to the main window
- Main window listens and increments a `refreshKey` to re-fetch the model list

## App state flow

```
workspace-setup → loading → ready
                         → error
```

- **workspace-setup** — first run or no saved workspace; user picks a directory
- **loading** — opencode server starting, workspace initializing
- **ready** — server running, session active, chat available
- **error** — server failed to start

## Key constraints

- Uses `@opencode-ai/sdk/v2` (v2 inline parameter style, NOT v1 `{ body, path, query }` style)
- `process.chdir()` to workspace path breaks `views://` URL resolution — workspace start is deferred to `initWorkspace` RPC
- New windows created after `process.chdir()` must pass `viewsRoot` explicitly
- `initWorkspace` is idempotent (cached promise) to prevent multiple opencode instances
- Port `0` for opencode server (OS-assigned) to avoid port conflicts
- Tailwind CSS is compiled separately (`bun run css`), output committed as `mainview/styles.css`
- Settings view shares `mainview/styles.css` via `views://mainview/styles.css` cross-view reference
- Always read files before writing — the user may have made edits outside the agent

## App menu & keyboard shortcuts

| Menu | Items | Shortcut |
|------|-------|----------|
| OpenKrow | About, Settings, Hide, Hide Others, Show All, Quit | Cmd+, / Cmd+Q |
| Edit | Undo, Redo, Cut, Copy, Paste, Select All | Cmd+Z/X/C/V/A |
| View | Toggle Full Screen | Ctrl+Cmd+F |
| Window | Minimize, Zoom, Close | Cmd+M / Cmd+W |

## Commands

```sh
bun run dev          # dev mode with CSS watch + electrobun watch
bun run start        # build CSS once + electrobun dev
bun run build        # production build
npx tsc --noEmit     # typecheck (one pre-existing error in electrobun dep re: @types/three is expected)
```

## SDK usage (v2)

```ts
// Correct v2 style:
client.session.list({ directory: "..." })
client.session.create({})
client.session.messages({ sessionID: "..." })
client.session.promptAsync({ sessionID, agent, parts, model })
client.question.reply({ requestID, answers })
client.question.reject({ requestID })
client.provider.list()
client.provider.auth()
client.auth.set({ providerID, auth })
client.auth.remove({ providerID })
client.provider.oauth.authorize({ providerID, method, inputs })
client.provider.oauth.callback({ providerID, method, code })

// WRONG v1 style (do not use):
client.session.list({ query: { directory: "..." } })
client.session.create({ body: {} })
client.session.messages({ path: { id: "..." } })
```
