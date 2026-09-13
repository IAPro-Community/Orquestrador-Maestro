# Workflow: CREATE

Default posture: `EVOLVE`. Default creativity: `LOW` unless the surface is new (auth, landing, empty product) — then `MEDIUM` or `HIGH` from the Design Profile.

## Sequence

1. Classify intent. If the user asked for a new screen on an existing product, keep identity from the Design Profile.
2. Load active design-system metadata. Search component, primitive, then pattern. Create a local component only after all three miss.
3. Propose the smallest composition: existing layout primitives plus the project's documented form, feedback, and navigation primitives.
4. Implement with the app's stack (React + TypeScript + SCSS Modules when that is already the app convention).
5. Cover empty, loading, error, disabled, and success states that the flow actually has.
6. Run Visual QA on the new route at `390`, `768`, `1280`, `1440`.
7. Review hierarchy, density, and generic-AI smells (`standards/visual-quality.md`).

## Forbidden

- Starting from a generic SaaS dashboard template.
- Adding a sidebar, metric cards, or hero because other apps have them.
- Inventing design-system APIs.
