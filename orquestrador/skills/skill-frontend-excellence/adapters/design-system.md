# Generic design-system adapter

Use this adapter to discover the design system configured by the current project. It is intentionally provider-neutral: the skill must not assume a package name, repository layout, framework, or private component catalog.

## Resolution order

1. A path explicitly configured by the project instructions or package metadata.
2. A public package export resolvable from the current workspace.
3. A generated component, token, or pattern index named by the project.
4. Project-local component usage and documentation.

Run `scripts/discover-design-system.mjs` before visual implementation. Record the provider name,
version, source path, confidence, evidence and date inspected. If discovery is `ambiguous` or
`unresolved`, set `requiresUserDecision: true` and block new visual implementation. The bundled
neutral Design Profile remains a process fallback only; it is never a component library or a
design-system decision.

## Lookup contract

Before creating a component, search metadata by purpose and read its public import path, supported states, accessibility notes, and token usage. Only create an app-local component after the public system and documented primitives have been checked.
