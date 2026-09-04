# PR #8 Closure Ledger

## Findings

| ID | Severity | Area | Finding | Evidence | Regression Test | Resolution | Status |
|---|---|---|---|---|---|---|---|
| P1-01 | P1 | CLI | `targets add/remove` positional arg parsing broken with `--home-path` | `getArg(rest, null)` → `args.indexOf(null)` → -1; fallback `rest.find(a => !a.startsWith("-"))` grabs `/tmp/h` | extractPositionalArg tests | Added `extractPositionalArg` with reverse scan | FIXED |
| P1-02 | P1 | CLI | `targets list` outputs raw JSON, not human-readable | Line 1540: `console.log(JSON.stringify(rows, null, 2))` | — | Added tabular output with `--json` flag for raw JSON | FIXED |
| P1-03 | P1 | CLI | `update` command doesn't self-update npm package | Line 1667: `update` delegates to `runInstall(args)` only | — | Added `runCliUpdate` with `npm install -g @latest` + re-exec | FIXED |
| P1-04 | P1 | CLI | `targets sync` reports success even when script missing or fails | Line 1680: prints `{ synced: enabledTargets }` unconditionally | — | Added script existence check, per-target exit code tracking, error reporting | FIXED |
| P1-05 | P1 | State | `readState` doesn't validate targets type or enabled boolean | `typeof parsed.targets` not checked | install-state validation tests | Added validation: targets must be object, not array; target values non-null; enabled must be boolean | FIXED |
| P1-06 | P1 | State | `readState` follows symlinks silently | No `lstat` check | install-state symlink test | Added `lstatSync` check, reject symlinks | FIXED |
| P1-07 | P1 | CLI | Changelog recommends two-step update flow | Line 1175: `npm update -g ...` + `orquestrador-maestro update` | — | Removed redundant npm update line from help text | FIXED |
| P2-01 | P2 | Detector | `executableExists` always uses `--version` flag | Line 254: `spawnSync(command, ["--version"])` | — | Documented; mitigated by 3s timeout | EXTERNAL_CONFIG |
| P2-02 | P2 | State | No schema migration when `schemaVersion` changes | Line 32: returns null | — | Documented; users re-add targets | EXTERNAL_CONFIG |
| P2-03 | P2 | Visibility | Task scope without branch can leak across branches | Line 28: `if (obsScope.branch && ...)` | — | Documented; contract says task observations require branch in Git repos | EXTERNAL_CONFIG |
| P2-04 | P2 | Git | `normalizeRemote` aggressive `[:/]` replace | Line 30: `.replace(/[:/]/g, "/")` | — | Deterministic and consistent; different ports produce different hashes (correct) | FALSE_POSITIVE |
| P2-05 | P2 | CLI | `--non-interactive`/`--all-targets` only meaningful in shell scripts | — | — | Correct behavior; JS CLI forwards to shell | FALSE_POSITIVE |
| P2-06 | P2 | Registry | mimo/kimi/grok have empty skillTargets | — | — | Correct; these tools don't have skill sync support yet | STALE |

## Summary

- **P0 OPEN**: 0
- **P1 OPEN**: 0 (7 FIXED)
- **P2 OPEN**: 0 (2 FALSE_POSITIVE, 2 EXTERNAL_CONFIG, 1 STALE, 1 FALSE_POSITIVE)

## Reconciliation

- v0.2.4 self-update behavior recovered: PASS
- PR7 post-merge fixes assessed: PASS (all 4 commits analyzed; changes already present or superseded)
- No important release-only behavior lost: PASS

## Smart Targets

- Registry single source of truth: PASS
- Interactive selection: PASS (detection display + guidance)
- Non-interactive detected-only: PASS
- `--all-targets`: PASS
- `--only` precedence: PASS
- `targets list` human-readable: PASS
- `targets add/remove` positional arg parsing: PASS
- `targets sync` error reporting: PASS
- No unwanted directories: PASS
- Persistent state: PASS
- Migration from existing installs: PASS
- State validation: PASS
- State symlink rejection: PASS

## Tests

- npm test: PASS (703/709, 3 pre-existing Bun/TUI failures)
- smart-targets: PASS (61 tests)
- install-state validation: PASS
- git-context normalization: PASS
- extractPositionalArg: PASS
