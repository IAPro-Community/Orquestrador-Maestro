# Stack Discovery

Detect before prescribing. A repository can contain several independent stacks.

## Evidence order

Prefer evidence in this order:

1. workspace/build manifests and project files;
2. dependency manifests and lockfiles;
3. framework configuration;
4. source imports and directory conventions;
5. file extensions only as fallback.

Never classify a stack from one extension when a stronger manifest contradicts it.

## Common signals

| Signal | Stack / role |
| --- | --- |
| `package.json`, `tsconfig*.json` | JavaScript / TypeScript |
| React dependency, `next.config.*`, Remix config | React / Next / Remix |
| Vue dependency, `nuxt.config.*` | Vue / Nuxt |
| `angular.json` | Angular |
| `svelte.config.*` | Svelte / SvelteKit |
| `astro.config.*` | Astro |
| `nx.json`, `turbo.json`, `pnpm-workspace.yaml` | JS/TS monorepo |
| `go.mod`, `go.work` | Go |
| `pom.xml` | Maven / Java / Kotlin |
| `build.gradle*`, `settings.gradle*` | Gradle / Java / Kotlin |
| `*.sln`, `*.csproj`, `global.json` | .NET |
| `pyproject.toml`, `requirements*.txt`, `Pipfile`, `poetry.lock`, `uv.lock` | Python |
| `composer.json` | PHP |
| `Gemfile`, `*.gemspec` | Ruby |
| `Cargo.toml` | Rust |
| `mix.exs` | Elixir |
| `pubspec.yaml` | Dart / Flutter |
| `Dockerfile`, Compose files | container tooling |
| `.github/workflows/*`, `.gitlab-ci.yml` | CI |

## Repository map

For each module record:

- path and role: frontend, backend/API, worker, CLI, library, mobile, shared package;
- language and version constraints;
- framework/runtime;
- package/build manager and lockfile;
- existing quality tools;
- test runner;
- build command;
- CI entry points.

A monorepo is not one stack. Do not install root-level tooling that fights module-local ownership unless the workspace already centralizes it.

## Preserve project policy

Read `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING*`, README development sections, editor config, CI and task runner files. Project policy outranks generic defaults when it remains technically sound.

## Unknown or partial stacks

If a language/framework is not covered by a reference:

1. identify its official formatter/linter/compiler/test conventions from project evidence or authoritative docs;
2. prefer already-installed tooling;
3. implement only high-confidence gaps;
4. report unsupported assumptions instead of guessing a configuration.

Do not block an otherwise healthy repository merely because one generated/vendor module is unsupported.
