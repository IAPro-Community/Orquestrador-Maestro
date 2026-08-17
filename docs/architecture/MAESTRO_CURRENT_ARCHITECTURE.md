# Maestro Current Architecture

## System Shape

Orquestrador Maestro is currently a Node.js CommonJS npm package targeting Node.js 18 or later. Its CLI delegates installation and verification to Bash and PowerShell scripts and exposes project-context helpers implemented in Node.js.

The package is primarily a portable, sanitized distribution of rules, skills, tool profiles, project documentation conventions, and installers. It does not currently operate an agent execution runtime, a Run Store, a provider adapter layer, or a VS Code extension.

## Current Components

```text
CLI
 ├─ installers and verifier
 ├─ doctor
 ├─ DEV helpers and context brief
 ├─ changelog and telemetry
 └─ packaged Orquestrador content
      ├─ rules and persistence contract
      ├─ skills registry and synchronizer
      ├─ declarative workflows
      ├─ tool profiles and entrypoints
      └─ workspace blueprints
```

## Execution and Skills Today

`SKILLS_ROUTER.json`, aliases, chains, and execution profiles guide agents toward a compact set of skills. `SKILLS_MANIFEST.json` is the managed canonical registry, while `sync-skills` mirrors only approved compact content into native roots. Community and Codex catalogs are kept in the Orquestrador library rather than copied wholesale into native scanned directories.

`WORKFLOW_SCHEMAS.json` is declarative and opt-in. It names phases and gates but does not execute providers or persist workflow state.

## Context and Persistence Today

`DEV/` is the human-readable, durable project-memory convention. `context brief` summarizes bounded project context; DEV gates and compaction preserve compatibility with both recommended and legacy DEV layouts. The package intentionally keeps this project memory separate from package installation and user-private data.

## Integration Surface Today

`PROGRAM_ENTRYPOINTS.json` and `tool-profiles/` map stable native entrypoints for Codex, OpenCode, Claude, Cursor, Gemini, Windsurf, Antigravity, and supported workspace clients. The integrations direct tools to the shared rules, project context, and skill router; they do not duplicate orchestration business logic.

## Operational Constraints

- Installer support spans Windows, Linux, and macOS through existing PowerShell and Bash paths.
- Publication validation sanitizes the public snapshot.
- Telemetry is opt-in and intentionally excludes project content, prompts, paths, and secrets.
- Existing long-running provider execution, cancellation, event streaming, verification evidence, and Git observation are not yet runtime capabilities.
