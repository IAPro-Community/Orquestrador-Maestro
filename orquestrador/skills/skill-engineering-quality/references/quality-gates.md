# Quality Gates and Developer Experience

## One command surface

Prefer the repository's existing task runner. Provide discoverable check-only commands for applicable concerns:

- format/check;
- lint/static analysis;
- typecheck/compile;
- test;
- build;
- security when in scope;
- aggregate quality.

Do not add Makefile + Taskfile + package scripts that duplicate one another. One orchestration surface is enough.

`quality` must verify without silently modifying tracked files. Keep `format`/`lint:fix` or equivalents explicit.

## Hooks

Hooks improve feedback but are not the authority.

### Pre-commit
Keep fast and scoped to staged/changed files where practical: formatting and quick lint checks.

### Pre-push
Use moderate checks such as lint, typecheck and focused/unit tests when latency remains acceptable.

Do not put full integration/E2E/race/vulnerability suites into every commit by default.

Preserve an existing healthy hook manager. For a multi-language repository with no hook system, a stack-neutral tool may be appropriate, but adding one must have a concrete DevEx benefit.

## CI

CI is authoritative and must execute check-only commands from a clean state.

- reuse project commands instead of maintaining different local-vs-CI logic;
- cache dependencies without caching correctness;
- keep failures attributable to a named gate;
- run heavier security, race, E2E or integration checks at the appropriate stage;
- never make CI auto-format and commit source.

## Generated/vendor output

Exclude build artifacts, coverage, vendored dependencies and generated sources from formatting/lint where appropriate. Fix their generator/source instead of editing output.

## Failure handling

When a quality command fails:

1. determine whether it exposes a real defect, incompatible configuration, environmental issue or pre-existing debt;
2. fix the root cause when in scope;
3. avoid blanket suppressions;
4. re-run the failed check and the aggregate gate;
5. report unresolved pre-existing failures by name.

Use `skill-systematic-debugging` when the failure is non-obvious rather than experimenting randomly.

## Completion evidence

Record:

- detected modules/stacks;
- tools preserved, added, migrated or deliberately omitted;
- exact validation commands and outcomes;
- CI/hook ownership;
- remaining risks/debt and why they were not changed.
