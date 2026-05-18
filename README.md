# OpenKrow

**5 AI agents. 1 desktop app. 0 employees needed.**

OpenKrow is a free, open-source desktop app that gives solo founders an entire AI team — marketing, development, legal, finance, and operations — so you can focus on building your product, not burning out.

[![GitHub](https://img.shields.io/github/stars/openkrow/openkrow?style=flat)](https://github.com/openkrow/openkrow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/discord/openkrow?label=Discord)](https://discord.gg/openkrow)

## Meet Your Agents

| Agent | Role |
|-------|------|
| **MKT** — Marketing | Blog posts, social media, newsletters, campaigns, landing page copy |
| **DEV** — Development | Code review, feature writing, bug fixes, documentation, pair programming |
| **LGL** — Legal | Terms of service, privacy policies, contracts, compliance docs |
| **FIN** — Finance | Expense tracking, invoices, runway forecasts, financial reports |
| **OPS** — Operations | Email triage, scheduling, support tickets, daily task management |

## Who It's For

Solo founders, indie hackers, bootstrappers, side hustlers, micro-SaaS builders, and anyone running a one-person company who needs a team but can't afford one yet.

## Download

Available on macOS, Windows, and Linux:

**[Download the latest release →](https://github.com/openkrow/openkrow/releases)**

Or build from source (see below).

## Build from Source

### Prerequisites

- [Bun](https://bun.sh) runtime
- [opencode CLI](https://opencode.ai) installed (expected at `~/.opencode/bin`)

### Commands

```sh
# Install dependencies
bun install

# Development mode (CSS watch + hot reload)
bun run dev

# Build CSS once + start
bun run start

# Production build
bun run build
```

## Architecture

Built with [Electrobun](https://electrobun.dev) (Bun-native desktop framework) and powered by [opencode](https://opencode.ai).

```
┌──────────────────────────────────────────────────┐
│  Bun Process (bun/)                              │
│  ├── Spawns opencode server (auto port)          │
│  ├── Multi-agent system with dedicated prompts   │
│  ├── Session & preference management             │
│  └── SSE event streaming via typed RPC           │
│                    ▲                             │
│                    │ Electrobun typed RPC         │
│                    ▼                             │
│  Main Webview (mainview/)                        │
│  ├── React 19 + Tailwind v4 chat UI             │
│  ├── Sidebar with agent selection                │
│  ├── Real-time word-by-word streaming            │
│  └── Session history & model selection           │
│                                                  │
│  Settings Window (settingsview/)                 │
│  ├── Provider authentication (API key + OAuth)   │
│  └── MCP server management                      │
└──────────────────────────────────────────────────┘
```

## Tech Stack

- [Electrobun](https://electrobun.dev) — Bun-native desktop framework
- [opencode SDK v2](https://opencode.ai) — AI agent server & client
- [React 19](https://react.dev) — UI framework
- [Tailwind CSS v4](https://tailwindcss.com) — Styling
- [TypeScript](https://typescriptlang.org) — Type safety

## Contributing

OpenKrow is built in the open. Fork it, self-host it, make it yours.

- [GitHub Issues](https://github.com/openkrow/openkrow/issues)
- [Discord Community](https://discord.gg/openkrow)

## License

MIT
