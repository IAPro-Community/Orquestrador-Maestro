# Generic design-system adapter

Use this adapter to discover the design system configured by the current project. It is intentionally provider-neutral: the skill must not assume a package name, repository layout, framework, or private component catalog.

## Resolution order

1. A path explicitly configured by the project instructions or package metadata.
2. A public package export resolvable from the current workspace.
3. A generated component, token, or pattern index named by the project.
4. Native semantic HTML and the bundled neutral Design Profile schema when no system is available.

Record the provider name, version, source path, and date inspected. If discovery fails, set `provider: unknown` and document the limitation rather than inventing an API.

## Lookup contract

Before creating a component, search metadata by purpose and read its public import path, supported states, accessibility notes, and token usage. Only create an app-local component after the public system and documented primitives have been checked.
