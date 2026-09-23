# Branch Policy — V1 consolidation

Updated: 2026-09-22

## Active branches

Only these branches are part of the current delivery path:

- `feature/upstream-consolidated-v1` — canonical V1 candidate. All new V1 work must land here or in a short-lived branch created from its current HEAD.
- `feature/upstream-validation-base` — temporary validation base for the consolidated V1 candidate / PR #7. Do not add product work here.
- `main` — repository baseline. Do not backport V1 work into historical feature branches.

## Frozen branches

All branches under `archive/` are immutable historical snapshots. They exist only for traceability and recovery.

The following former work branches have matching frozen snapshots and are no longer valid development targets:

- `feat/cli-novo`
- `feat/cli-novo-wip`
- `feat/hardening-and-evidence`
- `feat/linux-portability`
- `feature/adaptive-resolution-runtime`
- `feature/adaptive-resolution-runtime-pr`
- `feature/add-custom-skills`
- `feature/v1-context-skill-intelligence`
- `feature/v1-router-v3-design-skills`

Do not merge, rebase, regenerate artifacts, run repair workflows that push commits, or continue implementation on any frozen/obsolete branch.

## Automation rule

CI may validate any branch when manually requested, but repository automation must not push commits to frozen/obsolete branches. Generated artifacts must be produced on the current active feature branch and committed there deliberately.

## Recovery

If historical code is needed, cherry-pick the smallest verified commit or reimplement the behavior against the current canonical V1 branch. Never reactivate an obsolete branch as a second source of truth.
