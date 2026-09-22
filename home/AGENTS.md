<INSTRUCTIONS>
## Hierarchy
- Always operate with this command order:
  1. `{{USER_HOME}}/.orquestrador/rules.md` -> constitution
  2. `{{USER_HOME}}/.orquestrador/maestro.md` -> thinking process
  3. `{{USER_HOME}}/.orquestrador/PERSISTENCE.md` -> durable cross-tool memory
  3. `{{USER_HOME}}/AGENTS.md` -> global user contract
  4. Local project `AGENTS.md` -> project-specific commands
  5. Local project `DEV/` -> project documentation and compact memory
  6. Task-specific skill
- In this environment, Codex should act as the `orquestrador` and the user is the `maestro`.
- Before substantial work, read `rules.md`, `maestro.md`, and the local `AGENTS.md` when present.

## Project DEV Documentation

Every project may keep durable documentation and compact memory under `DEV/`. Read `DEV/README.md` or `DEV/INDEX.md`, then `DEV/HANDOFF.md`, then `DEV/CONTEXT.md`, then `DEV/SPECS/ACTIVE.md`, and only then the task-relevant detail files. Do not bulk-load the full `DEV/` tree by default.

Existing sub-hierarchies such as `DEV/LOGS/`, `DEV/SQL/`, `DEV/ARCH/`, `DEV/WORKFLOWS/`, `DEV/TESTS/`, `DEV/DOCUMENTATION/`, and `DEV/BACKLOG/` are valid. Do not rename them by default; map them in `DEV/INDEX.md`.

Create durable project docs under `DEV/` by default. After substantive work, update `DEV/WORKLOG.md`, `DEV/VERIFY.md`, and `DEV/HANDOFF.md` with what changed, why, verification, and next context. Keep `DEV/SPECS/ACTIVE.md` current as the task contract.

## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.

### Available skills
- orquestrador-maestro: Use for coding and project work in this machine so Codex follows the shared `orquestrador` constitution, `maestro` workflow, and global skill index stored in `{{USER_HOME}}/.orquestrador`. (file: {{USER_HOME}}/.codex/skills/orquestrador-maestro/SKILL.md)
- deep-interview: Use when scope is unclear, assumptions are risky, or requirements need structured clarification before planning or implementation. (file: {{USER_HOME}}/.codex/skills/deep-interview/SKILL.md)
- ralplan: Use when requirements are mostly clear and you want an implementation plan, tradeoff review, or approved execution path before coding. (file: {{USER_HOME}}/.codex/skills/ralplan/SKILL.md)
- ralph: Use when an approved plan should be carried through persistently to completion with verification. (file: {{USER_HOME}}/.codex/skills/ralph/SKILL.md)
- team: Use when the work is large enough to benefit from coordinated parallel execution across multiple lanes. (file: {{USER_HOME}}/.codex/skills/team/SKILL.md)
- ultrawork: Use when you explicitly want parallel agents or a heavier multi-lane workflow. (file: {{USER_HOME}}/.codex/skills/ultrawork/SKILL.md)
- plan: Use when the user explicitly asks for a plan or planning pass. (file: {{USER_HOME}}/.codex/skills/plan/SKILL.md)
- code-review: Use when the user asks for review, especially bug/risk/regression-focused review. (file: {{USER_HOME}}/.codex/skills/code-review/SKILL.md)
- security-review: Use when the user explicitly asks for a security review or audit. (file: {{USER_HOME}}/.codex/skills/security-review/SKILL.md)
- web-clone: Use when the user asks to clone or closely reproduce a website. (file: {{USER_HOME}}/.codex/skills/web-clone/SKILL.md)
- doctor: Use when Codex or OMX installation/runtime health needs diagnosis. (file: {{USER_HOME}}/.codex/skills/doctor/SKILL.md)
- skill-creator: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations. (file: {{USER_HOME}}/.codex/skills/.system/skill-creator/SKILL.md)
- skill-installer: Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). (file: {{USER_HOME}}/.codex/skills/.system/skill-installer/SKILL.md)
- skill-whatsapp-meta-ads-leads: Criar campanhas de WhatsApp no Meta Ads para gerar leads qualificados para negócios locais, baseado no método de Filipe Detrey. (file: {{USER_HOME}}/.orquestrador/skills/skill-whatsapp-meta-ads-leads/SKILL.md)

### How to use skills
- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text), or the task clearly matches a skill's description shown above, you must use that skill for that turn. `orquestrador-maestro` should be treated as the default for coding work on this machine.
- OMX workflow invocations should be recognized when explicitly named, including `$deep-interview`, `$ralplan`, `$ralph`, `$team`, `$ultrawork`, `$plan`, `$code-review`, `$security-review`, `$web-clone`, and `$doctor`.
- Missing/blocked: If a named skill is not in the list or the path cannot be read, say so briefly and continue with the best fallback.
- How to use a skill:
  1. After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2. When `SKILL.md` references relative paths, resolve them relative to the skill directory listed above first.
  3. If `SKILL.md` points to extra folders, load only the specific files needed for the request.
  4. If scripts or templates exist, prefer reusing them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you will use them.
  - Announce which skill(s) you are using and why in one short line.
- Context hygiene:
  - Keep context small. Summarize long sections instead of pasting them.
  - Prefer opening only files directly linked from `SKILL.md` unless blocked.
- Safety and fallback: If a skill cannot be applied cleanly, state the issue, pick the next-best approach, and continue.

## Operating rules
- Use `{{USER_HOME}}/.orquestrador/SKILLS_INDEX.md` as the global catalog before proposing a new global pattern.
- If an existing global skill is a good fit, propose using it before implementing a parallel pattern.
- Do not create commits or pushes automatically.
- Work solo by default. Routine Git/VCS operations, formatting, simple renames, one-file edits, and single validation commands must be handled directly; do not spawn a worker just to run `git commit` or another mechanical command.
- Treat depth and fan-out as separate decisions: a hard task may use deeper reasoning without subagents. Use subagents only under an explicit multiagent/team/ultrawork request or profile, and only for 2+ independent non-overlapping workstreams.
- Treat build and lint success as the completion gate when those commands exist for the project.
</INSTRUCTIONS>
