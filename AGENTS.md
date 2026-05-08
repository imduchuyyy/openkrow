# AGENTS.md

## Overview

Krow is a desktop AI chat app built with **Electrobun** (Bun-native desktop framework, not Electron). It wraps an **opencode** server via `@opencode-ai/sdk/v2` and renders a React 19 webview.

## Architecture

Two processes communicate via Electrobun's typed RPC:

- **Bun process** (`src/bun/`): Spawns opencode server, manages sessions, forwards SSE events
  - `index.ts` — entry point, auto-starts workspace on `~/Desktop`
  - `workspace.ts` — opencode server lifecycle, session CRUD, question reply/reject
  - `stream.ts` — SSE event bridge (opencode → webview via RPC messages)
  - `rpc.ts` — RPC handler definitions, idempotent `initWorkspace`
  - `agent.ts` — custom "krow" agent config, prompt loaded from `prompts/krow.txt`
- **Webview** (`src/mainview/`): React 19 + Tailwind v4 chat UI
  - `rpc.ts` — webview-side RPC + event emitter
  - `App.tsx` — main state machine: loading → ready, session/question management
- **Shared** (`src/shared/types.ts`): RPC schema types

## Key constraints

- Uses `@opencode-ai/sdk/v2` (v2 inline parameter style, NOT v1 `{ body, path, query }` style)
- `process.chdir()` to workspace path breaks `views://` URL resolution if called before webview loads — workspace start is deferred to `initWorkspace` RPC (called by webview on mount)
- `initWorkspace` is idempotent (cached promise) to prevent multiple opencode instances
- Port `0` for opencode server (OS-assigned) to avoid port conflicts
- Tailwind CSS is compiled separately (`bun run css`), output committed as `src/mainview/styles.css`
- Always read files before writing — the user may have made edits outside the agent

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

// WRONG v1 style (do not use):
client.session.list({ query: { directory: "..." } })
client.session.create({ body: {} })
client.session.messages({ path: { id: "..." } })
```
