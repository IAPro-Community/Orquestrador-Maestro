# Maestro Target Architecture

> Status: Target Architecture — direção futura, não estado atual.

## Direction

The target is the existing Maestro plus an optional local execution runtime. Legacy installation, skills, DEV, rules, hooks, sync, doctor, verify, tool profiles, and manual workflows remain first-class.

```text
Existing CLI ─┐
              ├─ Application API ─ Maestro Core ─ ExecutionPackage ─ ProviderAdapter
VS Code UI ──┘                         │                              │
                                      Skills, Context                 Provider CLI/API
                                         │
                                  Runtime, Git, Verification
                                         │
                                     Run Store
```

## Core Boundaries

The Core is provider-, terminal-, shell-, editor-, and UI-independent domain code. It owns contracts equivalent to `Task`, `Run`, `Step`, `Execution`, `Artifact`, `Verification`, `ProviderDescriptor`, `ProviderCapabilities`, `ExecutionProfile`, and `ExecutionPolicy`.

An `ExecutionPackage` is built before provider invocation and contains the task, selected profile and policy, deterministic context, resolved skills, workspace, permissions, verification plan, and previous artifacts. Provider adapters translate that package without introducing provider-specific conditions in the Core.

## Integration and Runtime

The supported internal integration boundary for V1 is versioned JSON-RPC 2.0 over stdio, exposed by the additive `orquestrador-maestro bridge --stdio` command. No daemon, socket transport, HTTP server, TUI, or editor client is part of the 1.0 release contract.

The runtime will own child-process lifecycle, events, cancellation, timeout, signals, artifacts, repository observation, and real verification results. It will not treat an agent statement as verification evidence.

## Managed Commands

V1 keeps a deliberately small managed-command facility. It launches an explicit executable without a shell and records bounded operational metadata. Persistent PTY sessions, tmux-backed sessions, TUI rendering, daemon/socket ownership, and editor-hosted terminals are outside the 1.0 contract and were removed from the release line.

## Skills and Context

A future unified Skill Registry wraps current mechanisms and combines only official Maestro skills, already-installed user skills, and project-local skills. It keeps source separate from verification:

- Official bundle skills: `source=maestro`, `verification=maestro_verified`.
- User and project discoveries: their respective source, `verification=unverified` unless independently established.

Identity is namespaced internally, preventing same-name skills from being merged silently. No marketplace, download, installation, update, copying, or modification of user skills is part of this design.

`context brief` remains an input to a future deterministic `ContextBuilder`; it is not replaced. `DEV/` remains human/documentary memory, while a future Run Store carries operational state.

## Delivery Order

Build compatibility tests first, then isolated core contracts, read-only bridge methods, Skill Registry, Codex execution, structured Run Store/events, Git and verification, Claude, the optional VS Code client, profiles, workflow execution, worktree isolation, and only then multiagent write workflows.
