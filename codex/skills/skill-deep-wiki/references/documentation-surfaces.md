# Documentation Surfaces

## Progressive disclosure

Prefer this information architecture:

- L0 — TL;DR;
- L1 — README;
- L2 — Quick Start;
- L3 — Guides;
- L4 — Reference;
- L5 — Architecture / internals.

A new user should not need internal architecture before achieving a useful result.

## README

README is the technical landing page, not the whole manual.

Normally include, when relevant:

1. product name and short value proposition;
2. TL;DR;
3. main verified capabilities;
4. practical benefits without invented metrics;
5. useful visual demonstration;
6. Quick Start;
7. documentation links;
8. project/status and contribution links where useful.

Explain benefits as:

`problem → capability → practical benefit`

Avoid generic marketing claims.

## TL;DR

Allow a reader to understand within roughly one minute:

- what it is;
- who it is for;
- what problem it solves;
- what it can do;
- how to start.

## Quick Start

When the product can be executed/consumed, aim for:

`install/clone → configure → run → first useful workflow → verify it works`

Document only applicable prerequisites, minimal configuration, environment variables, database setup, run command and first workflow. Verify commands whenever possible.

## Documentation tree

Create only directories/pages that contain useful content. A common shape is:

```text
README.md
docs/
  index.md
  quick-start.md
  installation.md
  concepts/
  features/
  guides/
  integrations/
  development/
  operations/
  architecture/
  api/
  cli/
  reference/
  troubleshooting.md
  faq.md
  glossary.md
  whats-new.md
  assets/
```

Do not create empty directories.

## Feature guides

Important features should normally answer:

- what/why/when;
- how to access/configure/use;
- examples;
- permissions;
- limitations;
- common errors;
- related features.

Do not force empty sections.

User guides should be task-oriented ("How to configure authentication"), while reference docs may use technical object/module names.

## Developer docs

When applicable document local environment, dependencies, structure, architecture, commands, tests, lint/typecheck/build, conventions, extension points, debugging and contribution flow. Link to canonical repository-specific contributing docs rather than duplicating them.

## Operations docs

When applicable cover deployment, environment/configuration, databases, queues, caches, object storage, observability, health checks, backups, migrations, rollback and troubleshooting. Never expose real secrets.

## API reference

For APIs document applicable endpoint/method/purpose/authn/authz/request/response/status/validation/pagination/filtering/errors/examples. Verify OpenAPI/Swagger against implementation when possible.

## CLI reference

For CLIs document command, syntax, arguments, flags, defaults, examples, output, errors and exit codes. Prefer executable examples.

## Configuration reference

Centralize configuration with fields such as name, required, type, default, description, example and security implications. Never include real passwords, tokens, API keys, production secrets or private connection strings.

## Troubleshooting

Base troubleshooting on realistic failures:

`problem → observed error → likely cause → solution → validation`

Cover only relevant areas such as installation, dependencies, database, config, auth, networking, build, containers, runtime and integrations.
