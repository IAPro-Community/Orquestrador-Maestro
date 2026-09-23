# Maestro Skills Architecture

This document describes the canonical V1 Skill model. Human-oriented discovery lives in [docs/skills/README.md](../skills/README.md); the generated catalog lives in [docs/skill-catalog.md](../skill-catalog.md).

## Design goal

A Skill is not a prompt fragment to load eagerly. It is a **capability contract** that lets Maestro decide:

- whether the capability applies;
- what context it needs;
- what context it should avoid;
- what output it promises;
- how that output must be verified;
- what risk/cost profile applies.

The runtime should select the smallest useful set of capabilities for the task.

## Canonical flow

```text
Intent
  ↓
Complexity Gate
  ↓
Routing signals
  ↓
Skill Registry
  ↓
Skill Router v3
  ↓
Primary Skill + bounded chains
  ↓
Context budget
  ↓
Execution
  ↓
Verification / Resolution
```

## Skill Contract V2

Official Maestro Skills must be native V2 contracts in Manifest V3.

Canonical fields include:

```text
identity
origin
maturity
capabilities
routing.useWhen
routing.doNotUseWhen
context.required
context.useful
context.avoid
outputs
verification
costProfile
risk
provenance
```

These fields are operational inputs, not documentation-only metadata.

## Origins

### maestro-core

Cross-cutting engineering capabilities maintained by Maestro.

Current V1 catalog: **15**.

Typical examples include preflight, repo health, debugging, engineering quality, database migrations, verification and release engineering.

### maestro-domain

Specialized capabilities maintained by Maestro.

Current V1 catalog: **41**.

Domains include frontend/UX, security, AI, SaaS, payments, media, integrations and analytics.

### external / library

Third-party or community content is normalized at the compatibility boundary.

External presence does not grant auto-routing. Without trustworthy routing evidence, the capability remains explicit-only.

### user / project

User-installed and project-local Skills keep their own formats and ownership. They do not need to adopt the Maestro manifest.

## Identity and verification

Runtime identity is namespaced conceptually, for example:

```text
maestro/<capability>
user/<provider>/<capability>
project/<repository>/<capability>
```

Source and verification are separate dimensions.

A Skill distributed in the official Maestro bundle can be treated as Maestro-owned/verified according to repository policy. A discovered user/project Skill is not promoted to that trust level simply because its ID resembles an official Skill.

## Routing evidence

Router v3 ranks evidence approximately by strength:

```text
explicit invocation
  >
exact alias
  >
exact useWhen
  >
specific contained alias
  >
specific contained useWhen
  >
capability route
```

The router then adjusts the decision with project signals such as stack, changed-file scope and verified-memory hints.

`routing.doNotUseWhen` can reject a candidate that would otherwise match textually.

Generic aliases such as `design`, `frontend`, `ai` or `saas` are deliberately weak and should not dominate a specific intent.

## Complexity and budgets

Before routing, the Complexity Gate classifies:

```text
MICRO
SIMPLE
STANDARD
COMPLEX
DEEP
```

The result bounds:

- maximum selected Skills;
- context tokens;
- reference loading;
- planning depth;
- verification depth;
- subagent eligibility.

High complexity alone does not enable multiagent execution. Explicit multiagent intent is also required.

## Context discipline

Each canonical Skill declares:

- **required** — context without which the Skill cannot reliably work;
- **useful** — context that can improve execution;
- **avoid** — domains/files that should not be loaded merely because they exist.

This makes context selection part of the Skill contract instead of an implicit prompt habit.

## Outputs and verification

A Skill must declare concrete outputs and verification requirements.

Examples:

```text
systematic-debugging
  → root-cause
  → verified-fix

database-migrations
  → migration-plan
  → rollback-plan
  → verification-evidence

adr
  → decision-record
```

Resolution remains the authority for validated completion. A Skill selection is not evidence that its output exists.

## Chains and recipes

A **chain** is a bounded router relationship: one selected Skill may invoke another allowed Skill when the second candidate also has evidence and the complexity budget allows it.

A **recipe** is a human/declarative multi-step composition.

Neither mechanism means “load all related Skills”.

## Distribution versus routing

Distribution answers **where the Skill can be loaded**.

Routing answers **whether the Skill should be selected for this task**.

These are intentionally independent.

A Skill can be native/on-demand/conditional and still be rejected by routing.

## Workflows, agents and providers

Do not collapse these concepts:

```text
Skill
  = specialized knowledge + contract

Workflow
  = execution sequence/strategy

Agent/provider
  = executor

Recipe
  = declarative composition

Resolution
  = validated-outcome authority
```

OMX workflows or provider-specific agent surfaces may consume Skills, but they are not canonical Skill origins.

## Sources of truth

Operational priority:

```text
runtime code
  ↓
orquestrador/SKILLS_MANIFEST.json
  ↓
orquestrador/SKILLS_ROUTER.json
  ↓
SKILL_ALIASES / SKILL_CHAINS / execution profiles
  ↓
generated catalog/reference
  ↓
narrative documentation
```

Generated files must not become a second manual source of truth.
