# Branch Policy — V1 default line

Updated: 2026-09-29

## Active branches

Only these branches are part of the current delivery path:

- `v1` — canonical V1 branch and repository default branch. All new V1 work must land here or in a short-lived branch created from its current HEAD.
- `main` — legacy compatibility line and historical integration baseline. It is not the source of truth for `1.x` releases.
- `release/1.0.0-beta` — historical V1 staging branch; use `v1` for new work.

## Frozen branches

All branches under `archive/` are immutable historical snapshots. They exist only for traceability and recovery.

The `archive/*` branches are historical consolidation checkpoints; they are not a one-to-one snapshot for every former work branch.

The following former work branches are frozen/obsolete and are no longer valid development targets:

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

## Release and npm rule

- CI validates `v1` and `main` independently.
- A `1.x` tag such as `v1.0.0-beta.3` must point to a commit contained in `v1`.
- GitHub Actions maps prerelease tags to npm dist-tags: `alpha` → `alpha`, `beta` → `beta`, `rc` → `next`, and stable versions → `latest`.
- The CLI updates from the channel matching its installed version, so a V1 beta never silently follows the legacy `latest` line.
- Repository automation must not push commits to frozen/obsolete branches. Generated artifacts must be produced on the current active branch and committed deliberately.

## Recovery

If historical code is needed, cherry-pick the smallest verified commit or reimplement the behavior against the current canonical V1 branch. Never reactivate an obsolete branch as a second source of truth.
