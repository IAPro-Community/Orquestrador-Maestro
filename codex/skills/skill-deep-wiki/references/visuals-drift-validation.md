# Visuals, Drift, Coverage and Validation

## Visual documentation

Use visuals when they reduce explanation cost or prove a state/flow.

- screenshot: stable state;
- annotated screenshot: state requiring callouts;
- GIF: short interaction;
- short video: longer workflow;
- Mermaid: maintainable architecture, flow, lifecycle or topology.

Do not create visuals as decoration.

When capture is needed, specify the exact evidence, for example:

- dashboard after first login;
- project creation flow;
- successful execution state.

Avoid vague requests like "take some screenshots".

Product Documentation decides **what** must be demonstrated. Delegate **how** to capture it to `skill-browser-agent`, `skill-webapp-testing`, or existing media/evidence capabilities.

Every complex diagram needs a short textual explanation.

## Documentation drift

Actively compare current evidence with documentation. Typical drift includes:

- implementation changed but README did not;
- CLI behavior differs from docs;
- routes/features exist but docs do not;
- API differs from OpenAPI/examples;
- environment variables differ from configuration reference;
- feature behavior/status changed without docs updates.

Report stale or unsupported claims. Do not silently preserve them.

## Coverage

Report coverage by meaningful domain, not vanity percentages. Examples:

- core features: documented/verified count;
- CLI: documented commands vs discovered commands;
- API: documented endpoints/contracts vs discovered;
- operations: complete/partial/unverified.

Do not fabricate 100% coverage. Explain missing/unverified areas.

## Validation

Before completion, use existing project tooling to validate applicable items:

- internal links and referenced files;
- commands and Quick Start;
- documentation build;
- Markdown syntax;
- Mermaid syntax;
- code examples;
- asset references.

Do not introduce heavy dependencies solely to validate docs.

A failed verification is evidence. Diagnose or report it; never rewrite the claim as "verified" merely because documentation was produced.

## Final report

Report:

1. documentation created;
2. documentation updated;
3. verified capabilities;
4. coverage;
5. visual artifacts created/requested;
6. documentation drift;
7. verification commands/results;
8. remaining unverified gaps.

Never claim successful verification without fresh evidence.
