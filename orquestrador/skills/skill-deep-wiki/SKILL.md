---
name: skill-deep-wiki
description: Use when documenting or auditing a software product or repository, creating or improving README, Quick Start, guides, API/CLI/configuration references, troubleshooting, visual documentation plans, or checking documentation drift after product changes.
category: documentation
risk: low
source: orquestrador-native
---

# Product Documentation / Deep Wiki

Transform the product that actually exists into accurate, navigable, maintainable documentation.

**Core principle:** evidence before documentation. Never promote an old README, issue, roadmap item, comment, or assumption into a current product capability without corroborating evidence.

## Workflow

1. **Discover** repository instructions, stack, modules, product surfaces, existing docs, tests, contracts, configuration and runtime entry points.
2. **Inventory** meaningful capabilities before writing. Record status, implementation location, entry point, configuration, permissions, limitations, tests and evidence.
3. **Verify** claims using the evidence hierarchy in `references/evidence-and-discovery.md`. Uncertain capability = `unverified`, not stable.
4. **Design docs** with progressive disclosure: TL;DR → README → Quick Start → guides → reference → architecture/internals.
5. **Write only useful surfaces.** Do not create empty directories or boilerplate pages.
6. **Request visual evidence** only where it improves understanding; delegate capture/automation instead of building a browser runtime here.
7. **Validate** links, commands, examples, assets, diagrams and docs build with existing project tooling.
8. **Report** coverage, drift, verification evidence and remaining gaps.

## Load References Selectively

- Always read `references/evidence-and-discovery.md`.
- README, Quick Start, guides, API/CLI/configuration, operations and troubleshooting: read `references/documentation-surfaces.md`.
- Screenshots/GIF/video/Mermaid, documentation drift, coverage and final validation: read `references/visuals-drift-validation.md`.

## Responsibility Boundary

Own documentation discovery, information architecture, README, TL;DR, Quick Start, user/developer/operations guides, API/CLI/config references, troubleshooting, FAQ/glossary, What's New, coverage and drift detection.

Do **not** own feature implementation, bug fixing, global QA, release approval, Git workflow, production-readiness decisions, browser automation, or a parallel evidence store.

Use existing Maestro capabilities when evidence requires them:

- `skill-browser-agent` for navigating/capturing UI evidence;
- `skill-webapp-testing` for executable browser journeys;
- `skill-watch-evidence` for existing video/screen-recording evidence;
- `skill-doublecheck` for contested factual claims;
- `skill-verification-before-completion` before claiming documentation is complete;
- `skill-adr` only for an actual architecture decision record.

## Guardrails

- Never invent features, metrics, APIs, config, screenshots or supported workflows.
- Never hide known limitations.
- Never create a docs-specific registry, runtime, browser engine or global evidence store.
- Never silently fix unrelated product defects found while documenting; report/escalate them.
- Never turn README into the entire manual.
- Never declare the product or release production-ready from documentation work alone.

## Completion Evidence

A completion claim requires, when applicable: capability inventory, evidence-backed claims, accurate README/TL;DR, usable Quick Start, relevant feature/reference docs, reported visual artifacts, drift report, coverage report, and fresh validation of commands/links/builds that were actually executed.
