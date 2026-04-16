# OpenKrow Tools Orchestration
Tool orchestration is a sophisticated system to act as the "hands and feet" of agentic loop.

## Intelligent Concurrency and Partitioning
When agent requests multiple tools in a single response, tool orchestration categorizes them at runtime to determine if they can run in parallel 
of must run sequentially.

- Safe-by-default: Every tool declares an `isConcurrencySafe` flag per invocation. Read-only tools like `FileRead`, `Grep` or `Glop` return true and are batched together to execute concurrently.
- Exclusive(Mutating): Tools with side effects, like `FileWrite`, `FielEdit` or `Agent` default to false and must rung sequentially to avoid race condition.
- Conditional safety: The `BashTool` evaluates safety dynamically based on the exact command. A read-only command like `ls`, `cat` or `grep` will be allowed to run concurrently, while a mutating command like `rm`, `mv` or `npm install` will be forced to run sequentially.

Greed batching strategy: If tool is safe and the previous batch tools are safe too , it will be added to the current batch. Once an unsafe tool is encountered, the current batch will be executed immediately and a new batch will be started.

## Sibling Abort Mechanism
When multiple tools are running in parallel, a failure in one tool requires careful handling. Agent implements a targeted "sibling abort" system. If an independent tool like a web fetch or a file read fails, it does not cancel the other parallel tools. However, if a Bash command fails, it immediately aborts its parallel siblings because shell commands often have implicit dependency chains (e.g., if creating a directory fails, copying a file into it will also fail)

## Context Modifier
Tools often need to update the execution context for the next tool in line (e.g., a file-write tool needs to inform the next tool that a new file path exists). To achieve this without race conditions, tools can return a contextModifier callback. As a strict architectural constraint, only sequentially executed (exclusive) tools are allowed to apply these modifiers. This ensures the shared state evolves deterministically, following an immutable, functional programming pattern at the system level

## Cache-Stable Assembly

## Dynamic Tool Search
