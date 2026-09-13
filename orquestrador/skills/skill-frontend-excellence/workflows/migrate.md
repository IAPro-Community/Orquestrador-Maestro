# Workflow: MIGRATE / REFACTOR (PRESERVE)

Applies to design-system migrations, React upgrades, router changes, TypeScript migration, and performance refactors.

**Default: `PRESERVE` + creativity `NONE`.** Visual change not requested is a regression.

## Sequence

1. Boot the current application.
2. Capture baseline screenshots at `390`, `768`, `1280`, `1440`.
3. Record routes, viewports, and known console noise.
4. Map each legacy component to the active design system via metadata (`legacyEquivalent`, `migrationGuide`, or equivalent). If no equivalent exists, keep local behavior and document a candidate — do not invent a shared component.
5. Replace imports and behavior without restyling to “look more modern”.
6. Capture after screenshots.
7. Diff. Allowed deltas: anti-aliasing, font hinting, focus rings that were missing and are now required for a11y **if** the request included a11y. Color, spacing, radius, and layout shifts are failures unless listed as unavoidable library differences and accepted in the task notes.
8. Run Visual QA. Console must not gain new errors.

## Mapping hints

- Prefer the package's documented public subpath to match the application's existing import style.
- Keep form primitives on their documented public export; do not guess a barrel path.
- Do not import CSS per-component unless the active design system documents that contract.

## Definition of Done extras

- [ ] baseline comparison stored
- [ ] no unintended redesign
