# Maestro Evolution Plan

## Additive Delivery Plan

| Phase | Deliverable | Gate |
|---|---|---|
| 0 | Architecture, compatibility baseline, and accepted RFC. | Existing tests pass; no intentional behavior change. |
| 1 | Focused legacy compatibility contracts. | Protected legacy behaviors pass. |
| 2 | Isolated runtime domain contracts. | Core has no provider, shell, UI, or editor dependency. |
| 3 | Versioned JSON-RPC stdio bridge, starting read-only. | Protocol contracts pass; legacy remains untouched. |
| 4 | Unified Skill Registry adapters. | Official, user-installed, and project skills list without installation or download. |
| 5 | Codex adapter and local process lifecycle. | One Run supports streaming, timeout, cancellation, PID, exit code, and lifecycle evidence. |
| 6 | Run Store and structured events. | Runs remain queryable across applicable CLI lifecycles; DEV is unaffected. |
| 7 | Git observation and verification engine. | Completion cannot bypass actual command results. |
| 8 | Claude adapter. | The same request works through both adapters without Core branching. |
| 9 | Optional VS Code extension MVP. | Extension remains a UI/client; CLI stays fully functional. |
| 10 | Execution profiles independent of provider. | Profile, policy, and provider remain distinct. |
| 11 | Deterministic sequential workflow runtime. | Sequential, condition, retry, and approval are reproducible. |
| 12 | Workspace manager and worktree isolation. | No concurrent writable execution shares a workspace. |
| 13 | Multiagent compositions. | Artifacts, isolation, verification, and workflow controls are established. |
| 14 | Hardening. | Cross-platform, recovery, protocol, storage, privacy, security, and documentation checks pass. |

## Required Implementation Rules

- Each phase is a small cohesive change with its own tests, self-review, documentation update, and gate report.
- Existing commands and schemas are extended only additively; new public fields are optional by default.
- No automatic skill acquisition, automatic deployment, Git push, destructive Git action, external migration, mandatory database, mandatory daemon, or mandatory extension.
- Multiagent work must not permit simultaneous writes to a shared workspace.
- Provider capability claims must be demonstrated by the adapter implementation and its contract tests.

## Phase Report Format

Every completed phase reports changed and added surfaces, compatibility evidence, tests run and passed, legacy regressions, remaining risks, architecture decisions, a suggested commit message, and the next gated phase.
