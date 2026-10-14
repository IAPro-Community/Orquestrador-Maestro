---
name: skill-aionui-cowork-orchestration
description: Use when integrating AionUi into the {{USER_NAME}} orchestrator workflow, coordinating Codex, Claude, Gemini, OpenCode, or other CLI agents through AionUi without breaking local skills, hooks, MCPs, permissions, or existing Codex workflows.
category: orchestration
risk: medium
source: public-orquestrador
---

# AionUi Cowork Orchestration

Use this skill to evaluate, configure, or operate AionUi as an external cowork/team UI around the existing {{USER_NAME}} orchestrator. AionUi should coordinate agents; it must not replace `{{USER_HOME}}/.orquestrador` as the source of truth.

## Role In The Stack

- `{{USER_HOME}}/.orquestrador` remains the brain: rules, router, aliases, chains, skills, hooks, and validation.
- Codex remains the primary implementation agent unless the user explicitly chooses another executor.
- AionUi is a coordination surface for multi-agent visibility, approvals, remote access, scheduled checks, and team runs.
- Other agents such as Claude, Gemini, OpenCode, and AionUi built-in agents are specialists: research, review, verification, docs, UI critique, or isolated alternatives.

## Safe Defaults

- Do not enable YOLO/full-auto for code changes, production systems, payments, auth, secrets, migrations, RLS, cron jobs, or customer data.
- Start with read-only/review workflows before write workflows.
- Limit initial team runs to 2-3 agents.
- Use one project workspace at a time.
- Require explicit user approval before agent actions that write files, run installs, alter git state, or call external services.
- Keep Codex/OpenCode/Claude configs intact; add AionUi integration instructions around them instead of rewriting their home folders.

## When To Use AionUi

Use AionUi when:

- The user wants a visible cowork dashboard for multiple agents.
- Work benefits from simultaneous Codex/Claude/Gemini/OpenCode perspectives.
- A task needs scheduled or remote follow-up, but should remain observable.
- MCP configuration should be reviewed or unified across agents.
- The user wants a Leader/Teammate team flow outside a single Codex thread.

Do not use AionUi when:

- A single Codex edit can finish safely.
- The current machine is already overloaded with Codex, MCP, browser, or Node processes.
- The task touches secrets, billing, production, or data migrations without explicit approval.
- The user wants the fewest moving parts.

## Recommended Agent Roles

- `Leader`: reads the user request, `.orquestrador` router, and assigns lanes.
- `Codex Executor`: implements code and owns final integration.
- `Claude Reviewer`: architecture, security, auth, RLS, payment, and maintainability review.
- `Gemini Researcher`: current docs, SDK behavior, dependency/version research.
- `OpenCode Explorer`: local codebase mapping, alternative implementation notes, quick checks.
- `Verifier`: runs commands, compares claims against files, and reports residual risk.

Prefer specialists with narrow scopes over many agents with broad prompts.

## AionUi Assistant Prompt

Use this as the baseline custom assistant instruction inside AionUi:

```text
You are operating on {{USER_NAME}}'s Windows workstation.

Before broad work, read:
1. {{USER_HOME}}/AGENTS.md
2. {{USER_HOME}}/.orquestrador/rules.md
3. {{USER_HOME}}/.orquestrador/maestro.md
4. {{USER_HOME}}/.orquestrador/SKILLS_INDEX.md
5. {{USER_HOME}}/.orquestrador/SKILL_EXECUTION_PROFILES.json
6. {{USER_HOME}}/.orquestrador/SKILL_ALIASES.json
7. {{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json
8. {{USER_HOME}}/.orquestrador/SKILL_CHAINS.json

Use the smallest relevant skill set. Do not load full skill catalogs.
Do not edit mirror skill roots directly; edit {{USER_HOME}}/.orquestrador/skills first and run sync.
Do not auto-commit or auto-push.
Do not enable full-auto/YOLO for code, secrets, payments, auth, production, database migrations, RLS, cron, or customer data.
Codex is the default executor. Other agents should review, research, verify, or work on explicitly assigned independent lanes.
```

## Team Mode Pattern

1. Leader reads the orchestrator router and chooses an execution profile.
2. Leader writes a short task board:
   - goal
   - constraints
   - active skill(s)
   - agent lanes
   - file/module ownership
   - verification commands
3. Codex owns implementation and integration.
4. Specialist agents work only on their assigned lanes.
5. Leader aggregates outputs into:
   - changed files
   - findings
   - verification evidence
   - unresolved risks
6. Codex or the user runs the final validation gate.

## Skill Chaining

Common chains:

- SaaS build/review:
  - `skill-saas-factory`
  - `skill-multiagent-orchestration`
  - provider/security/UI skills only when evidence requires them
- Multi-agent coordination:
  - `skill-multiagent-orchestration`
  - `skill-aionui-cowork-orchestration`
- Security review:
  - `skill-saas-security-scan`
  - `skill-security-hooks`
  - `skill-aionui-cowork-orchestration` only for coordination/visibility
- AI/model routing:
  - `skill-ai-orchestration`
  - `skill-aionui-cowork-orchestration` when multiple model providers are compared through AionUi

## Runtime Health Checklist

Before starting a heavy AionUi team run:

- Confirm RAM and CPU are not saturated.
- Check for duplicate Codex/MCP/Playwright processes if Codex is slow.
- Confirm only the needed dev servers are running.
- Confirm the target workspace is the intended project.
- Confirm full-auto/YOLO is disabled for risky tasks.

## Validation

After adding or changing AionUi integration:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador/doctor.ps1
```

For skill changes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador/sync-skills.ps1 -Apply
```

## Related Skills

- `skill-multiagent-orchestration`
- `skill-ai-orchestration`
- `skill-saas-factory`
- `skill-security-hooks`
- `skill-saas-security-scan`
