# Branch Policy — V1 default line

Updated: 2026-11-25

## Active branches

Only these branches are part of the current delivery path:

- `v1` — canonical V1 branch for active `1.x` releases. All new `1.x` work lands here (or via short-lived PR branch from its current `HEAD`).
- `main` — historical integration baseline (updated via fast-forward from `v1` once `1.x` releases stabilize; see [BRANCH_RELEASE_TRANSITION.md](architecture/BRANCH_RELEASE_TRANSITION.md) for the planned post-1.2.0 single-branch cutover).

## Frozen and retired branches

- Historical `archive/*` remote branches are **retired** and eligible for cleanup on `origin`; full history remains preserved via immutable release tags and commits on `v1`/`main`.
- Do not create new work or merge/rebase onto obsolete `release/1.0.0-beta`, `feat/*`, `feature/*`, `fix/*`, or `cleanup/*` branches:

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
