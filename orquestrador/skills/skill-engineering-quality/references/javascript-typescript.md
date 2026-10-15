# JavaScript / TypeScript Quality

## Preserve the package manager

Detect from `packageManager`, lockfile and workspace files. Do not create a second lockfile. Respect npm, pnpm, Yarn or Bun already selected by the project.

## Tool selection

Use the existing healthy toolchain first.

- Existing ESLint: evolve its current config. Prefer Flat Config for new modern setups when supported.
- Existing Biome: keep Biome authoritative for concerns it already owns; do not install ESLint solely to duplicate formatting/basic lint.
- Existing Prettier: preserve it as formatter and remove conflicting stylistic lint rules where applicable.
- No formatter/linter: choose the smallest ecosystem-appropriate baseline after checking framework requirements and versions.

Avoid overlapping formatters.

## TypeScript

When TypeScript exists:

- keep an explicit check-only type command such as `tsc --noEmit` or workspace equivalent;
- respect project references and framework-specific typecheck commands;
- enable stricter compiler flags only when migration cost is understood;
- do not "fix" strictness failures with broad `any`, assertions, or ignores.

## Framework additions

### React / Next / Remix
Validate hooks semantics, component correctness and accessibility when ESLint is authoritative. Do not use this skill for visual redesign; route that work to `skill-frontend-excellence`.

### Vue / Nuxt
Use framework-supported TypeScript and lint integrations. Prefer `vue-tsc` when the project already relies on it.

### Angular
Respect Angular CLI builders, workspace config and its supported lint/test stack. Do not bolt generic Vite conventions onto Angular workspaces.

### Svelte / SvelteKit
Use framework-native check/build commands and existing ESLint/Prettier integrations when present.

### Astro
Keep Astro's own check/build pipeline and framework adapters in mind.

### React Native
Treat Metro/mobile build constraints separately from browser React. Do not assume DOM-only accessibility or browser E2E tools.

## Testing and build

Preserve the existing runner: Vitest, Jest, Node test runner, Playwright, Cypress or framework-native alternatives. Do not add a second unit runner without a concrete need.

Baseline checks, when applicable:

- formatter check;
- lint;
- typecheck;
- unit/component tests;
- production build.

Browser E2E belongs in `skill-webapp-testing` when the requested baseline requires it.
