---
name: skill-multiagent-orchestration
description: Use when a task mentions subagents, multiagents, parallel agents, team execution, swarm, delegation, or requires dividing independent engineering work across agents while preserving integration safety and token efficiency.
category: orchestration
risk: medium
source: public-orquestrador
---

# Multiagent Orchestration

Use this skill to decide whether multiagent execution is worth it, then divide work without creating merge conflicts, duplicated exploration, or excessive token use.

## Start Here

Use multiagents only when at least one condition is true:

- There are 2+ independent workstreams with different files, domains, or verification gates.
- A broad audit can run in parallel with a local implementation.
- The user explicitly asks for subagents, multiagents, team, swarm, or parallel execution.
- A task is large enough that one agent would spend most of its time waiting on search, tests, or independent reviews.

Keep work solo when:

- The task is a routine Git/VCS operation such as status, diff, add, commit, push, pull, branch inspection, or tagging. The lead agent performs it directly; do not create a Git worker for mechanical commands.
- The task is formatting, a simple rename, a one-file edit, or running one validation command.
- The next step is a blocking decision or a single-file change.
- Agents would edit the same files.
- The task requires one continuous mental model more than parallel throughput.
- The overhead of prompts, review, and merge is larger than the work.

## Execution Profiles

### Fast

- Agents: 0
- Use for direct fixes, simple questions, small edits, and one obvious skill.
- Goal: minimum context and fastest path.

### Standard

- Agents: 0
- Default profile for normal engineering work.
- Keep implementation, research, and verification in the lead process unless execution is explicitly promoted to multiagent.

### Deep

- Agents: 0
- Use for broad or difficult work that needs more reasoning, context, or verification.
- Deep means greater reasoning depth, not automatic fan-out.

### Multiagent

- Subagents: 1-4
- This is the only normal execution profile that permits provider fan-out.
- Use only when there are at least 2 independent, non-overlapping workstreams and parallel execution materially helps.

### Team

- Subagents: 2-4
- Team is an explicit multiagent workflow, not an automatic consequence of task complexity.
- Require disjoint ownership and a lead/integration owner.

## Delegation Rules

Before spawning agents, write a short split:

1. What stays with the lead agent.
2. Which workstreams are independent.
3. Which files or modules each agent owns.
4. What each agent must return.
5. Which validation command proves the integrated result.

Each delegated task must include:

- Scope: exact files, directories, subsystem, or question.
- Non-overlap: what the agent must not edit.
- Output: patch summary, findings, changed paths, tests run, and blockers.
- Constraint: do not revert or overwrite other agents' changes.
- Verification: the smallest useful command or evidence for that lane.

## Recommended Agent Lanes

Use these lanes when they match the task:

- `explore`: map files, symbols, project structure, and likely touchpoints.
- `executor`: implement a bounded feature or refactor in owned files.
- `security-reviewer`: review auth, secrets, tenancy, RLS, payments, SSRF, injection, and webhook risks.
- `test-engineer`: add or fix tests and define validation strategy.
- `code-reviewer`: review final diff for regressions and maintainability.
- `designer`: UI/UX review or implementation for frontend surfaces.
- `dependency-expert`: check external SDK docs, package versions, and integration constraints.
- `verifier`: confirm completion claims against commands, diffs, and acceptance criteria.
- `skill-premium-web-experience` may use these lanes for genuinely independent research, UX strategy, art direction, motion, implementation, and QA. Keep ownership disjoint and centralize the final integration; do not let multiple agents edit the same component tree simultaneously.

Prefer fewer agents with better scopes over many agents with vague scopes.

Treat reasoning depth and delegation as independent axes. Never select multiagent merely because a task is marked deep, complex, security-sensitive, or long-running. There must be parallelizable work.

## SaaS Default Split

For SaaS creation or review, start with:

- Lead: architecture, integration, final decisions, and conflict resolution.
- Explorer: project conventions, routes, data model, auth, payment touchpoints.
- Backend executor: server actions, API routes, billing, webhooks, entitlements.
- Frontend executor: dashboard/admin UX, states, forms, responsive behavior.
- Security reviewer: RLS, secrets, payment webhook verification, access control.
- Test/verifier: lint, typecheck, focused tests, smoke checks.

Only activate payment-specific skills when the project actually uses that provider:

- AbacatePay -> `skill-abacatepay-integration`
- Stripe -> `skill-stripe-integration`

Only activate security scan skills for owned local repos or explicitly authorized targets:

- Local repo -> `skill-saas-security-scan`
- Hooks/CI gates -> `skill-security-hooks`
- Staging/preview URL -> `skill-saas-dast-recon`

## Token Control

- Load the router and aliases before loading full skill bodies.
- Load one top-level skill first, then chain only the skills needed by evidence.
- Do not paste entire catalogs or long file trees into agent prompts.
- Give agents file paths and exact questions instead of broad context dumps.
- Ask agents for concise structured results, not full narratives.
- After agents return, summarize and integrate. Do not replay all agent output.

## Conflict Control

- Assign write ownership before implementation.
- Keep shared files with the lead agent unless a worker has explicit ownership.
- If two agents need the same file, sequence the work instead of parallelizing it.
- Review changed paths before integrating results.
- Run the highest-signal verification after integration, not only per-agent checks.

## Completion Gate

Do not claim multiagent work is complete until:

- Every agent has returned or been deliberately canceled.
- Changed paths are reviewed for overlap.
- The integrated result was validated with project-appropriate commands.
- Remaining risks are named explicitly.

## Related Skills

- `skill-saas-factory`
- `skill-ai-orchestration`
- `skill-saas-security-scan`
- `skill-security-hooks`
- `skill-frontend-ux-guardrails`
- `skill-unified-analytics`
