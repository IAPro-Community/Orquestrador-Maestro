# Universal harness coexistence — release 1.2.0

Scope: issues #67, #82 and #86. This increment is additive; it is not native Goal certification, automated corrective execution, or a new orchestrator.

## Authority and compatibility levels

- Portable: the installed Maestro protocol and skills instruct the host to prepare context and verify against project criteria, regardless of whether it has a Goal.
- Governed: a real, trusted host hook can apply context budgets or other deterministic policy. Textual hooks are not executable hooks.
- Goal integrated: requires real lifecycle observation, single continuation owner, independent acceptance bound to the exact revision, and version/surface-specific evidence. No host is certified at this level by this increment.

| Surface | Delivered integration | Missing proof |
| --- | --- | --- |
| Codex / OpenAI hook-capable desktop | existing governor; prompt-visible slash command advisory; Stop observation | slash commands may bypass prompt hooks; native Goal state, terminal event and independent acceptance not certified |
| Claude Code | portable protocol; ordinary runtime adapter; opt-in command hooks | live registration/trust and Goal binding |
| OpenCode | portable protocol; ordinary runtime adapter; opt-in V2 plugin | SDK/runtime compatibility and native Goal binding; V1 remains portable |
| Antigravity | portable profile; ordinary runtime adapter | native lifecycle support unknown |
| Gemini CLI | portable profile; opt-in command hooks | live registration/trust and Goal binding |
| Cursor, Windsurf | portable profiles, textual guidance | executable hook configuration, trust and real tests |
| Grok CLI, MiMo Code, Kimi Code, Freebuff | portable profile | Goal lifecycle unknown; no Maestro-owned headless provider |
| Junie, Goose, OpenHands, Continue, Cline, Copilot | catalog/blueprint coverage varies | certify per tool, version and surface before advertising enforcement |

The authoritative current headless checks remain in `runtime/providers/goal-preflight.js` and `docs/product/GOAL_PROVIDER_CAPABILITIES.json`. Ollama and LM Studio are model providers, not coding harnesses. Do not infer integration from installation, a tool name, a skill or a generic event.

## Behavior and rollback

The OpenAI plugin only recognizes an anchored literal /goal when the host actually forwards it. Control commands also count as observations, not creation. The native state remains unknown. The existing policy digest differentiates observed-command turns; the next ordinary prompt retains the existing policy shape. Stop only records the most recent matching observed-command turn with verification not performed. It does not request continuation, cancel a Goal, start a provider or execute untrusted project scripts. Observe mode records without injecting; off mode disables the plugin. Host trust is unchanged.

Existing managed submissions, RunStore, worker, Goal Loop, VerificationEngine and ResolutionEngine remain authoritative and unchanged. No parallel store, scheduler, new dependency, automatic credentials change, or external Goal completion claim.

## Opt-in executable adapters

Run these commands from the installed npm package root or a trusted checkout (Node 20.19+):

```bash
node scripts/harness-hook.js --render claude
node scripts/harness-hook.js --render gemini
```

Review the generated JSON and append only its hook groups to the existing trusted user or project settings; never replace existing settings blindly. To prepare a merged configuration or remove only the exact generated groups, pipe the existing strict JSON settings into the helper and write its output to a **different** file:

```bash
node scripts/harness-hook.js --merge claude < settings.json > settings.maestro.json
node scripts/harness-hook.js --remove claude < settings.json > settings.rollback.json
```

Use `gemini` instead of `claude` for Gemini. Back up the original, review the diff and apply through the host's trusted configuration procedure. The helper is idempotent, preserves unrelated hooks and settings, and rejects malformed input. It never edits files itself. Removal uses exact generated groups from the same package path; customized or relocated entries require manual review. Do not redirect output to the input file. Claude uses seconds and Gemini uses milliseconds for timeout. Disable/remove only the added groups to roll back. These hooks do not persist raw prompts, run project commands, or request retries. Stop/AfterAgent return neutral JSON. A host may intercept slash commands before prompt delivery.

For OpenCode V2, install the pinned SDK in the local plugin directory explicitly (not a Maestro runtime dependency), then append its absolute directory to the existing V2 `plugins` array in `opencode.json(c)`. Keep the full Maestro package in place; the plugin imports its shared contract. V1 uses a different plugin API and is not supported by this plugin.

```bash
cd tool-profiles/opencode/maestro-harness-v2
npm install --ignore-scripts
```

The V2 prompt hook observes without changing the user text or attachment offsets. The model-context hook adds at most one short advisory block per request for sessions whose latest observed prompt exposed /goal. Bounded in-memory state (256 sessions) is cleared on unload; it is not a Goal ledger or reliable lifecycle state. Remove only this plugin entry to roll back.

The shared event contract returns `dispatchAllowed: false`, `goalState: unknown`, and `verification: not-performed` for all external events. The runtime Goal assessor continues to accept only manifest-bound canonical submissions. A generic host event cannot create a verification receipt. This increment is advisory and **does not provide enforcement or independent external acceptance**.

Synthetic checks:

```bash
node --test tests/harness-contract.test.js
```

Live tests must record host version, hook/plugin registration, delivered events, and absence of duplicate execution. See the official [Gemini hook reference](https://geminicli.com/docs/hooks/reference/) and [OpenCode V2 plugin migration](https://opencode.ai/docs/build/plugins/migrate-v1).

## Operator-reviewed external delivery checks

The public CLI exposes the existing configuration helper as `orquestrador-maestro harness --render|--merge|--remove claude|gemini`. The host still owns hook trust.

For a delivery produced by any external harness, a trusted local operator can review a **clean committed worktree** and explicitly approve a bounded set of checks. Stop the agent first. Review all code and scripts (including dependencies); do not treat an allowed npm or Maven command as a sandbox. Keep the JSON and its output outside the reviewed worktree:

```json
{"workspacePath":"/path/to/project","checks":[{"criterionId":"unit-tests","command":"npm run test","timeoutMs":60000}]}
```

```bash
orquestrador-maestro harness --preview-review < review.json
orquestrador-maestro harness --verify-review APPROVAL_DIGEST < review.json
```

Use the displayed approvalDigest after human review. On Windows use the equivalent PowerShell pipeline with `Get-Content -Raw`. The digest binds the worktree identity, Git HEAD, existing verifier-input snapshot, criterion IDs, commands and timeouts. The same scope is rechecked before and after every check. Drift, errors and failed checks stop the review; a non-green result exits nonzero. Checks use the canonical VerificationEngine command runner, with its policy, diagnostic and timeout handling. No hook or remote client can trigger this operation through an event.

This is a local diagnostic, not an authenticated approval, sandbox, transitive integrity proof or complete acceptance contract. Ignored/generated inputs, concurrent changes restored before observation, Git configuration and external dependencies are outside the bounded drift guard. The operator must use a trusted isolated workspace. A green result remains `CHECKS_PASSED` for the listed checks only, with `acceptanceCertified: false`, `goalState: unknown` and no RunStore write. It cannot mint a Goal PASS, certify native lifecycle or authorize another loop.

## Release gates and follow-up

- [ ] Run full tests and installer/upgrade/rollback on final release SHA.
- [ ] Test the plugin in actual Codex TUI and Desktop with a native Goal, ordinary prompt, repeated turn, stop, cancel, resume and compact; record whether each event is exposed.
- [ ] Verify Claude and OpenCode separately against current supported versions and extension contracts; do not infer Goal completion from idle/Stop.
- [ ] Exercise Gemini, Cursor and Windsurf integrations only with explicit hook trust and preserve existing user config.
- [ ] Check portable discovery for other advertised profiles; unsupported lifecycle is reported, never emulated silently.
- [ ] Prove independent verifier execution with approved immutable scope, revision and criterion binding before advertising external Goal acceptance.
- [ ] Keep corrective dispatch and headless native Goal blocked until issue #67 gates and real-provider certification pass.

Official extension references for implementers: [Codex Goals](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex), [Claude hooks](https://code.claude.com/docs/en/hooks), [OpenCode plugins](https://opencode.ai/docs/plugins/).

Only Portable and tested Governed behavior may be claimed on release. This checklist remains open until real evidence is attached.
