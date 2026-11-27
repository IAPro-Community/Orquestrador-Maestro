# Release 1.2.0 finalization — Harness First

Working branch: `v1`. Baseline: `88047181c12e217b73138a0f1f255bf10111ab07`.
Baseline Tests [46049967469](https://github.com/IAPro-Community/Orquestrador-Maestro/actions/runs/46049967469): 13/13 jobs successful; Security [46049967421](https://github.com/IAPro-Community/Orquestrador-Maestro/actions/runs/46049967421): successful. These results do not certify later commits or real interactive sessions.

## Scope and invariants

Feature freeze: prefer the native interactive workflow, no mandatory go/run or /goal. Reuse Router V3, Complexity Gate, Context Engine, skills, memory, RunStore, Bridge and verification. No competing loop, second scheduler, new database or Nexus/Calango/SDK work. No implicit permissions, paid provider use, publication or main changes. All engineering changes directly on v1; refresh HEAD before writing. Keep native Goal ownership and uncertified managed autonomy disabled. This plan supplements #86 and #82, not a replacement for their acceptance criteria.

## Execution sequence

| Phase | Issue | Exit gate |
|---|---|---|
| 0 baseline | #86 | Exact SHA, all CI, frozen scope, open issues reconciled |
| 1 shared core | #82 | Local deterministic routing, bounded context, no redundant catalogs, no lowered risk floor |
| 2 primary harnesses | #82 | Real native sessions for Codex, Claude, OpenCode, Gemini; ordinary prompts, skills, isolation, resume/compact, safe fallback. Cursor/Antigravity official capability-aware integration or explicit portable fallback |
| 3 distribution | #44 #86 | Clean install, 1.1.1 upgrade, RC upgrade, user settings preservation, rollback and uninstall from actual tarball on Linux/Windows/macOS |
| 4 Goal coexistence | #67 | One owner, no competing dispatch, no Stop/Idle completion claim; overnight remains experimental unless separately certified |
| 5 runtime | #48 #41 #82 | Honest adapter capabilities, session identity, bounded corrective retry, process recovery, Bridge v1 compatibility, evidence binding |
| 6 token regression | #82 #86 | Real paired native benchmark, equivalent validated outcomes, usage/cost/latency with missing data explicit |
| 7 review | #86 #89 | All 13 Tests jobs and Security jobs on exact SHA; package hygiene, dependency compatibility, no critical/high unresolved defect in stable scope |
| 8 documentation | #86 | PT/EN quickstart, migration, troubleshooting, capability matrix, changelog; no unsupported marketing claim |
| 9 governance | #81 #86 | Exact evidence and pending work mapped to existing issues; no closure without full acceptance |
| 10 publication | #86 | Authorized cutover to main, main-specific CI and publication gate, immutable new version/tag, verified tarball and registry promotion |

## Work items

- [ ] Core: classify compound/negative/ambiguous tasks, preserve risk floor; progressive skill budgets and no duplicate hydration. Native router must not call an LLM.
- [ ] Codex: validate CLI/IDE/Desktop hooks, ledger boundary resets, native permissions and fresh independent review sessions. Headless resume must be real or explicitly unavailable.
- [ ] OpenCode: verify V2.4.1 actual SDK event shapes, outgoing delivered message identity, location and queue isolation. Resolve SDK before registration, support V1 fallback and JSONC without destroying user data. Test packed plugin on real host.
- [ ] Claude/Gemini: verify real hook output contract, trust/activation, lifecycle, single routing per turn, preserved settings and fallback. No simulated certification.
- [ ] Cursor/Antigravity: verify official hooks and capabilities by version/surface, integrate only supported semantics; others retain portable contract.
- [ ] Installer: user global AGENTS/CLAUDE/GEMINI files, managed markers, legacy references, custom providers/MCPs/hooks, idempotence, rollback, permissions and paths.
- [ ] Runtime: session resume capability audit across providers, cancel/timeout/restart, no duplicate side effects, durable approval and proof. Corrective retry bounded; never feed rejected provider output back as instructions.
- [ ] Benchmark: vanilla vs v0.3.5, v1.1.1, original RC and corrected candidate. Same provider/model/effort, fresh/resumed, cache cold/warm, verified fixtures and failures included. Report provider tokens (input/output/cache/reasoning separated), calls, latency, cost and success. No cost or tokens invented. Existing public claim gate requires at least 20 comparable pairs for the claim. Engineering targets vs pre-fix RC: MICRO 50%, SIMPLE 30%, STANDARD 20% reduction; no unjustified complex/deep regression. Targets not measurements.
- [ ] Final review: npm ci, verify:pr, validate, skills:contract-audit:strict, validate:paths, memory:contract, bench:typecheck, bench:test, pack:dry-run, homologate-release.sh plus real provider certification where authorized. Record SHA, commands, results and missing evidence.
- [ ] Release: reconcile BRANCH_RELEASE_TRANSITION.md with live workflows and rulesets. Do not merge to main, bump/tag or publish without explicit authorization and all applicable gates. Never reuse published RC version. Separate CI evidence from local exception approvals.

## Decision record

Stable release NO-GO until the required stable-scope gates are proven. Managed overnight may remain experimental; native coexistence remains mandatory. No real benchmark or provider certification is implied by mocks, CI smoke, source changes or this document. Maintain evidence in #86 and related issues. Missing credentials, platform or API evidence is BLOCKED/NOT_TESTED rather than PASS.
