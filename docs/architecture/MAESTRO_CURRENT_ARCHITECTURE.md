# Maestro Current Architecture

> Status: Current — descreve a arquitetura implementada nesta base.

## System Shape

Orquestrador Maestro is currently a Node.js CommonJS npm package targeting Node.js 20 or later. Its CLI delegates installation and verification to Bash and PowerShell scripts and exposes project-context helpers implemented in Node.js.

The support floor is Node.js `>=20.0.0`. The required compatibility matrix is Linux full on
Node.js 20, 22, and 24, with Windows/macOS smoke coverage on Node.js 20 and 24.

The package is a portable, sanitized distribution of rules, skills, tool profiles, project documentation conventions, installers, and an additive local execution runtime. The runtime exposes the Application API, Run Store, provider adapters, verification engine, and bridge; the optional VS Code extension remains outside this package.

## Current Components

```text
CLI
 ├─ installers and verifier
 ├─ doctor
 ├─ DEV helpers and context brief
 ├─ changelog and telemetry
 ├─ runtime, bridge, providers, runs, and verification
 └─ packaged Orquestrador content
      ├─ rules and persistence contract
      ├─ skills registry and synchronizer
      ├─ declarative workflows
      ├─ tool profiles and entrypoints
      └─ workspace blueprints
```

## Execution and Skills Today

`SKILLS_ROUTER.json`, aliases, chains, and execution profiles guide agents toward a compact set of skills. `SKILLS_MANIFEST.json` is the managed canonical registry, while `sync-skills` mirrors only approved compact content into native roots. Community and Codex catalogs are kept in the Orquestrador library rather than copied wholesale into native scanned directories.

`WORKFLOW_SCHEMAS.json` remains declarative and opt-in. The runtime executes approved local runs through provider adapters and persists lifecycle evidence without replacing the human-readable DEV memory.

## Context and Persistence Today

`DEV/` is the human-readable, durable project-memory convention. `context brief` summarizes bounded project context; DEV gates and compaction preserve compatibility with both recommended and legacy DEV layouts. The package intentionally keeps this project memory separate from package installation and user-private data.

## Integration Surface Today

`PROGRAM_ENTRYPOINTS.json` and `tool-profiles/` map stable native entrypoints for Codex, OpenCode, Claude, Cursor, Gemini, Windsurf, Antigravity, and supported workspace clients. The integrations direct tools to the shared rules, project context, and skill router; they do not duplicate orchestration business logic.

## Operational Constraints

- Installer support spans Windows, Linux, and macOS through existing PowerShell and Bash paths.
- Publication validation sanitizes the public snapshot.
- Telemetry is opt-in and intentionally excludes project content, prompts, paths, and secrets.
- Provider execution, cancellation, event streaming, verification evidence, and Git observation are local runtime capabilities; deployment, external migrations, and automatic skill acquisition remain opt-in and outside the default path.
