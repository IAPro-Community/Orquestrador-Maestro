# PR #8 Closure Ledger

Canonical review ledger for `feat/reconcile-main-smart-skill-install`. Allowed
statuses are `OPEN`, `FIXED`, `INVALID`, `EXTERNAL_CONFIG`, and `DEFERRED_P2`.

| ID | Severity | Subsystem | Description | Reproduction | Root Cause | Files | Regression Test | Fix | Verification | Status | Review provenance |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PR8-001 | P1 | Ownership | Add could overwrite a user-owned skill file and later remove it | Pre-create `SKILL.md`, add, remove | Existing paths were treated as managed without proof | `bin/orquestrador-maestro.js`, `orquestrador/lib/install-state.js` | user-owned skill preservation test | Hash-backed `managedEntries`; preserve unverified files | Targeted suite + verify gate | FIXED | User brief; adversarial reproduction |
| PR8-002 | P1 | Ownership | Remove could delete a Maestro file edited by the user | Add, edit, remove | No current-content check | `bin/orquestrador-maestro.js` | modified managed file test | Remove only on matching SHA; explicit `--force` | Targeted suite + verify gate | FIXED | User brief |
| PR8-003 | P1 | Marker | Existing non-Maestro marker could be overwritten | Pre-create marker with unrelated content | Marker was written blindly | `bin/orquestrador-maestro.js` | marker conflict test | Recognize exact marker; preserve unknown marker | Targeted suite | FIXED | User brief |
| PR8-004 | P1 | Rollback | Failed add could leave ancestor directories or replaced files | Fail after recursive mkdir/copy | Transaction tracked too little state | `bin/orquestrador-maestro.js` | rollback suite | Record missing ancestry and restore replacements | Targeted suite + verify gate | FIXED | User brief |
| PR8-005 | P1 | State | Invalid managed paths and state-directory symlinks were accepted | Persist traversal/absolute paths or symlink state dir | Weak path validation and parent following | `orquestrador/lib/install-state.js` | traversal and state-symlink tests | Relative-path validator and fail-closed ancestors | Targeted suite + verify gate | FIXED | User brief |
| PR8-006 | P1 | Symlink safety | Install/remove/promote could write through symlinks | Point managed path at an outside directory | Physical containment not checked at every mutation | `bin/orquestrador-maestro.js`, `orquestrador/bin/memory.js` | symlink target/state/promote tests | `lstat` ancestry/destination checks | Targeted suite + verify gate | FIXED | User brief |
| PR8-007 | P1 | Memory | Missing branch/context could widen scope to repository | Record branch scope without branch context | Resolver defaulted to repository | `orquestrador/lib/visibility.js`, `orquestrador/bin/memory.js` | fail-closed scope tests | Return no scope instead of widening | Targeted suite + verify gate | FIXED | User brief |
| PR8-008 | P1 | Privacy | Persisted fields beyond summary/details could retain secrets or private paths | Secret/path in files, tags, source | Sanitizer covered selected fields only | `orquestrador/bin/memory.js` | all persisted fields redaction test | Recursive redaction | Targeted suite + verify gate | FIXED | User brief |
| PR8-009 | P1 | Context | Headings were not charged to bucket budgets and metrics were opaque | Tight budget with long heading | Counted content only | `orquestrador/bin/context-brief.js` | heading/bucket metrics test | Charge rendered heading and expose allocated/actual values | Targeted suite + verify gate | FIXED | User brief |
| PR8-010 | P1 | Verify gate | Shell glob and tracked symlink scan were unsafe/non-portable | Run from cmd/PowerShell or add tracked symlink | Shell glob and separate inventory/readFile | `scripts/run-tests.js`, `scripts/verify-pr.js` | canonical verify gate | Deterministic Node discovery; one inventory; `lstat` regular files only | `npm run verify:pr` PASS | FIXED | User brief |
| PR8-011 | P1 | Release | Downstream jobs could rebuild or resolve a mutable ref | Change ref between validate and publish | Jobs independently resolved source | `.github/workflows/release.yml` | workflow inspection; CI pending | Validate SHA once, pack once, upload tarball+SHA, consume exact artifact | Static review only | OPEN | User brief; no authenticated CI run |
| PR8-012 | P1 | Update lifecycle | Update does not persist new-target offer/decline transitions exactly once | Enable Codex, later detect OpenCode, update repeatedly | No persisted transition/decline model | `bin/orquestrador-maestro.js`, install scripts, state model | Missing complete regression test | Add TTY offer, noninteractive notice, persisted decline suppression | Reproduction remains valid | OPEN | User brief; independent adversarial review |
| PR8-013 | P1 | Review evidence | Current PR review threads could not be fetched | `gh pr view 8` returned HTTP 401 | No authenticated GitHub access | N/A | N/A | Re-fetch and classify all threads with authenticated access | Not verifiable here | OPEN | Initial audit, 2026-09-04 |
| PR8-014 | P1 | Cross-platform | Windows/macOS lifecycle changes have not executed in this environment | Run matrix jobs on new HEAD | Local environment is Linux-only | `.github/workflows/test.yml`, release workflow | Workflow inspection only | Require new-head matrix evidence | Linux gate PASS; OS matrix pending | OPEN | User brief; independent review |
| PR8-015 | P2 | JSON API | `targets list --json` lacked stable envelope | Parse JSON output | Rows emitted directly | `bin/orquestrador-maestro.js` | JSON envelope test | Emit `{schemaVersion:1,targets:[...]}` | Targeted suite | FIXED | User brief |
| PR8-016 | P2 | State migration | Unknown state schema is recovered as null, not migrated | Read schema other than 1 | No migration contract | install-state | validation tests | Fail closed; migration deferred | Full gate | DEFERRED_P2 | Historical review |
| PR8-017 | P2 | Registry | Shell adapters retain profile tables that can diverge | Compare shell and JS definitions | Legacy shell installer | install scripts, registry | registry tests | Target CLI uses central registry; shell parity deferred | Full gate | DEFERRED_P2 | User brief |
| PR8-018 | P2 | Detector | Command probe has no injected runner | Fake command lookup | Direct `spawnSync` dependency | tool-detector | deterministic config tests | Bounded timeout; injection deferred | Full gate | DEFERRED_P2 | Historical review |
| PR8-019 | P2 | Branch protection | Protection cannot be configured without admin permission | Query settings | No authenticated admin capability | Repository settings | N/A | Provide exact settings to maintainer | Not configured | EXTERNAL_CONFIG | User brief; no GitHub auth |
| PR8-020 | P2 | Release policy | Suggested inverted ancestry operands conflict with release policy | Compare merge-base operands | Review suggestion incompatible with release-from-main history | release workflow | local ancestry gate | Keep release SHA ancestor of main | Local gate PASS | INVALID | User-stated policy |

## Summary

- P0: 0 open.
- P1: 4 open (`PR8-011`–`PR8-014); merge is not authorized by this ledger.
- No invalid legacy statuses remain.

## Verification evidence

- `npm run verify:pr`: PASS on this HEAD; 950 tests, 944 passed, 0 failed, 6 skipped.
- Targeted Smart Targets, Memory, Context, and hardening suites: PASS.
- `git diff --check`: PASS.
- GitHub review threads/checks: unavailable because `gh` returned HTTP 401.
- Windows/macOS jobs: workflow definitions updated but not executed locally.

## Reconciliation

- Historical PR #7 commits were inspected; no blind cherry-pick was performed.
- Release ancestry follows the required policy: release SHA must already be an ancestor of `origin/main`.
- No merge, tag, npm publish, or main rewrite was performed before the requested final review.
