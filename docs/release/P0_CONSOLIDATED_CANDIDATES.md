# P0 release candidates — Maestro 1.1.2 + Nexus 1.0.0-beta.12

> **Status: CANDIDATE / NO-GO.** Branch names and version metadata are
> incremental versions, **not** an authenticated release, signed artifact or
> acceptance of the complete P0. This document is the single source of
> instructions for both repositories; do not run duplicate MissionRunner or
> memories in Nexus.

## Canonical development branches

| Repo | Canonical release branch | Baseline | Superseded work |
| --- | --- | --- | --- |
| `IAPro-Community/Orquestrador-Maestro` | `release/v1.1.2` | latest published `v1.1.1` + existing `v1` commits | #62, #63, #64 already merged into `v1`; #65 copied with **exact file hashes and complete commit ancestry** |
| `IAPro-Community/nexus` | `release/v1.0.0-beta.12` | `release/v1.0.0` | #207 + #208 merged as independent nonoverlapping trees with both PR heads as Git merge parents |

The candidate package, lockfile and embedded OpenAI plugin metadata now say
`1.1.2`. **Public bootstrap scripts and stable installation documentation
intentionally remain pinned to published `1.1.1`** until the new version is
actually validated and published; do not point public installers at a
nonexistent npm release.

No new feature, fix, or test branch should be used to continue these P0
workstreams: develop on the canonical release branch only, with short reviewable
commits and exact-SHA local evidence. Other teams' unrelated branches and
historical release branches are not within the deletion scope.

PRs #65 / #207 / #208 were **closed as superseded**, not marked "merged" into
the old branch. Their original commit histories and contents remain in the
new release ancestry. Don't confuse this with a production promotion.

## Quick local smoke — both products, single command

**Prerequisites (once per real device):**
- Clone/fetch both repositories, check out their canonical release branches,
  verify clean worktrees (the runner refuses dirty sources).
- Install Node.js >=20.19 and Git. Install dependencies as per the repositories'
  locked installation instructions (Maestro `npm ci`; Nexus
  `bun install --cwd web --frozen-lockfile`). Install Bun 1.3.9 and Go at the
  `go.mod` toolchain version used by Nexus.
- For visual capture, install Playwright's Chromium:
  `bun run --cwd web playwright install chromium`. Requires a working browser
  and the Nexus backend build prerequisites. Don't request external providers
  or credentials for this synthetic phase.

**Linux/macOS Bash (from Maestro root):**
```sh
git switch release/v1.1.2
node scripts/p0-release-qa.cjs --nexus=../nexus
```

**Windows PowerShell (from Maestro root):**
```powershell
git switch release/v1.1.2
node .\scripts\p0-release-qa.cjs --nexus="C:\path\to\nexus"
```

The Nexus checkout must be on `release/v1.0.0-beta.12`. The runner checks
the two exact source SHAs and package versions **before** executing anything,
then runs Maestro's submission/supervisor/Bridge suites, Nexus Go handoff tests,
frontend format/typecheck and focused Composer/Flow tests. Stop on first error;
never print/store raw logs that may contain secrets. It writes an **unsigned**
JSON report in the local temp directory, prints the report checksum, and
returns a nonzero exit code on failure.

For a wider local pass, use `--full`. This includes broader repository tests
and Web build, but cannot replace native GUI/terminal tests.

## Real visual evidence: unblock Nexus docs without falsifying the manifest

On the clean, exact Nexus candidate source checkout, run from Maestro:

```sh
node scripts/p0-release-qa.cjs --nexus=../nexus --capture
```

The capture uses an isolated synthetic Nexus fixture, writes *actual*
screenshots and a `source_sha` matching the source checkout, and then runs
`node scripts/docs-verify.mjs`. Review all generated images, responsive
layouts, Composer/Flow/AGY/OpenCode controls, and the manifest. **Only if
the capture and review pass**, commit the generated screenshots/manifest from
the Nexus release branch. A screenshot-only commit advances `HEAD`; the
manifest's source SHA remains the exact **rendered code commit** and
`docs-verify` must confirm that no visual source changed after it.
Do not replace the SHA manually, mark a historical Desktop capture current,
or disable the gate. This resolves the current circular CI blocker without
using GitHub-hosted screenshots as a substitute for device QA.

## Minimum actual end-to-end homologation

After the synthetic smoke and screenshots pass:

1. On **Linux amd64 physical device**, test Maestro standalone with a real
   authorized AGY and OpenCode installation in isolated Git worktrees.
   Capture actual provider/version, provider call count, exact input artifact
   hashes, approval and per-task receipts. A mocked provider **cannot pass**.
2. On **two real Nexus clients** pointed to the same project and Maestro
   authoritative RunStore, confirm saved revisions, provider choices, cancel,
   refresh/reconnect, and unauthorized cross-project access. Run submission
   must remain disabled until real durable approval, multi-task DAG routing,
   worktree reservations and recovery are implemented and verified.
3. Replay the same acceptance matrix on **Windows amd64** and **macOS arm64**
   physical devices. Store per-platform source SHA, binary checksum, test IDs,
   redacted evidence, explicit reviewer and signed authorization.
4. Verify restart after claim and uncertain dispatch: no second provider call,
   quarantine rather than automatic retry, and visibility through Nexus.
   Test a failed parent with preserved independent DAG branches after the
   Goal Loop review, with finite budget and no unapproved dispatch.
5. Confirm rollback/install/update preservation and every required obligation
   from Nexus #115. No "GO" until the human acceptance and source-integrity
   gates pass.

At present `runs.submit` is deliberately **false**. Full end-to-end
multi-provider tests therefore remain **BLOCKED**, not silently skipped or
labeled as passed.

## Remove superseded branches after consolidation

A **read-only preview** is available:
```sh
node scripts/p0-prune-branches.cjs --nexus=../nexus
```

When the preview shows only verified `SAFE` refs, and both remote release
branches and review evidence have been checked, request explicit remote
deletion from an authenticated checkout:
```sh
node scripts/p0-prune-branches.cjs --nexus=../nexus --apply
```

The exact-SHA/merge-proof manifest is
`docs/release/p0-branch-prune.json`. Cleanup uses a remote lease to refuse
deletion if another contributor moved a branch. Non-ancestors, changed refs,
unrelated work and nonmerged historical proposals are left intact; they
require separate technical review. **Do not mass-delete repository branches**
by prefix or creation date.

## Decision record

- All recent P0 functional source changes are consolidated into one active
  release branch per repository.
- Existing Maestro RunStore, memory, approval and Go/CLI separation are
  preserved; no new Nexus scheduler.
- CI is optional and cost-bearing, not the ground truth for native release.
  The local harness creates **unsigned preliminary evidence** only.
- **NO-GO:** actual AGY/OpenCode multi-DAG, production bootstrap/approval,
  global deadlines/receipts, screenshot recapture and device attestations
  remain open.
