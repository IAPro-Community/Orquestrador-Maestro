---
name: skill-engineering-quality
description: Use when a repository needs a quality baseline or modernization across one or more detected application stacks, especially linting, formatting, type checking, tests, build validation, developer tooling, hooks, or CI consistency.
category: engineering
risk: medium
source: orquestrador-native
---

# Engineering Quality

Apply a maintainable quality baseline to the repository that actually exists. Detect the stack first, preserve healthy conventions, and change only the gaps that matter.

## Workflow

1. Read repository instructions and manifests before editing: `AGENTS.md`, package/build manifests, lockfiles, tool configs, CI files, and workspace definitions.
2. Build a stack map for every relevant module. Use manifest/build evidence before file-extension guesses. In monorepos, classify modules independently.
3. Inventory existing format, lint/static analysis, type checking, tests, build, security checks, hooks, and CI.
4. Compare the inventory with the applicable stack reference. Prefer existing healthy tooling; add or migrate tools only when there is a concrete gap or incompatibility.
5. Implement the smallest coherent delta. Keep one owner per concern: formatter formats, linter/static analyzer finds semantic issues, compiler/type checker checks types, tests verify behavior, CI is the authoritative gate.
6. Run project-native checks, fix real failures, and re-run from the final state. Keep autofix commands separate from check-only quality gates.
7. Report detected stacks, changed baseline, commands executed, evidence, and remaining risks.

## Load References Selectively

- Always read `references/discovery.md`.
- JavaScript/TypeScript, Node, React, Next, Vue, Nuxt, Angular, Svelte, SvelteKit, Astro, React Native: read `references/javascript-typescript.md`.
- Go: read `references/go.md`.
- Java/Kotlin or .NET: read `references/jvm-dotnet.md`.
- Python, PHP, Ruby, Rust, Elixir, Dart/Flutter: read `references/python-php-ruby-rust.md`.
- Hooks/CI/quality command design: read `references/quality-gates.md`.

## Guardrails

- Do not install ESLint merely because a frontend exists. If Biome or another healthy equivalent is already authoritative, preserve it.
- Do not introduce competing formatters, test runners, package managers, lockfiles, or build systems.
- Do not replace a working tool only because this skill prefers another.
- Do not silence failures with blanket disables, `any`, `@ts-ignore`, `nolint`, skipped tests, or equivalent shortcuts.
- Do not mass-upgrade dependencies as a side effect. Use `skill-dependency-upgrade` when an upgrade becomes a real workstream.
- Do not redesign product UI here. Use `skill-frontend-excellence` for visual/product frontend work.
- Do not turn a simple formatter/config edit into multiagent work.

## Related Skills

Invoke only when evidence requires it:

- `skill-repo-health`: broad repository diagnosis beyond baseline setup.
- `skill-systematic-debugging`: a gate fails for a non-obvious root cause.
- `skill-dependency-upgrade`: non-trivial dependency migration.
- `skill-security-hooks`: security-specific recurring hooks or CI gates.
- `skill-webapp-testing`: browser/E2E coverage is required.
- `skill-frontend-excellence`: design-system, UX, responsive, or visual work is requested.
- `skill-verification-before-completion`: final completion claims.

For a standard task, load at most one downstream skill unless independent evidence justifies more.

## Completion

Do not call the baseline complete until applicable format-check, lint/static analysis, typecheck/compile, tests, and build commands have been executed or explicitly marked not applicable with evidence. CI configuration must run check-only commands and remain the final authority.
