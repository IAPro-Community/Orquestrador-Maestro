# Universal Task Router - Capability Registry (increment 1)

**Status:** Pure, read-only preview library. No Bridge method or dispatch yet. No
CLI/API discovery, authentication, quota checks, persistence or benchmark-based
routing has been implemented. Never present a preview as an executed task.

## Architecture and ownership

Maestro owns model/tool routing and the durable execution lifecycle; Nexus is
the UI, not another scheduler or memory store. Model, provider, connection,
harness, subscription and tool are distinct.

- Inference provider: OpenAI, Anthropic, Google, or another endpoint.
- Harness: Codex CLI, Claude Code, OpenCode, AGY or another installed agent.
- Connection: one authenticated or locally installed route with a unique ID.
- Model: an explicit model ID **supported by that particular connection**.
- Tool: non-LLM capability such as process.execute, git.status or video.render.

ChatGPT is a product/account identity, not an executable model ID. Connecting
Codex with ChatGPT sign-in does NOT imply that Luna is its default. A user may
prefer Luna for fast-tier tasks, but it must be attested ready by the adapter.
A separate OpenAI API connection has different credentials, billing and access.

## Catalog schema

runtime/routing/capability-registry.js defines three connection kinds:
agent-harness, model-api, local-tool. Each has a status: ready, unverified or
unavailable. Models also need individual status and a tier (fast, standard,
deep). All readiness is attested by trusted host adapters, never assumed from
a model name or user policy.

modelControl:
- per-run: adapter has verified a model selector for this exact run.
- session-only: only the verified current session default is used.
- default-only: only a verified harness configuration default is available.
- unknown: no unverified override is attempted; use only a verified default.

The additional modelLockGuarantee value is 'enforced', 'harness-fallback'
or 'unknown'. Hard model locks are blocked unless a trusted adapter attests
'enforced'. modelReporting is 'actual-model', 'requested-only' or 'unknown'.
A request flag is never sufficient proof that the expected model actually ran.

Do not confuse having a '--model' CLI argument with actual account/model
availability. Warp may use its own built-in Auto router; unless it reports the
underlying model, Maestro must not invent that identity.

## Illustrative profile (not persisted yet)

    {
      "mode": "auto",
      "profile": "balanced",
      "preferredConnectionId": "codex-chatgpt",
      "allowCrossProviderFallback": false,
      "tierPreferences": {
        "fast": {"connectionId": "codex-chatgpt", "modelId": "gpt-6-luna"},
        "standard": {"connectionId": "codex-chatgpt", "modelId": "gpt-6.1-sol"}
      }
    }

Policy precedence proposed for persistence:
(1) governance, privacy and permitted connections (mandatory hard bounds);
(2) explicit task connection/model locks (hard bounds);
(3) project preferences;
(4) user preferences;
(5) verified harness default.
A preferred model is a hint, never an availability claim. Cross-provider
fallback remains disabled unless explicitly approved and revalidated.

The pure function previewTaskRoute({catalog, task, policy}) can return only
READY_FOR_REVIEW or BLOCKED; both contain previewOnly:true and
executable:false. A tool task can route to a local-tool and reports modelId:null
without calling any model. The catalog is supplied by trusted host code,
not an untrusted client or the Nexus browser.

The initial deterministic ranking considers tier and preferences, not actual
token cost or measured quality. It cannot promise a cheaper or better result.
The 'locked' mode for model tasks requires both requestedConnectionId and
requestedModelId. Cross-provider opt-in never overrides task locks.

## Future work and homologation

1. Trusted adapter discovery: CLI version, authentication identity, selectable
   models, current/default model, model-control granularity and tool sandbox.
2. Persist scoped user/project policy in existing Maestro configuration and
   migrate safely, without storing secrets or creating semantic memory.
3. Negotiate a read-only Bridge preview without replacing existing
   plans.routePreview or silently routing another provider.
4. Include approved selection and locks in executable manifests; recheck at
   dispatch and record actual model in durable evidence.
5. Finish Maestro #48 durable DAG worker, idempotency, recovery and cancellation.
6. Homologate the API/harness/tool cases on real Linux, Windows and macOS.
7. Project route preview and execution in Nexus without importing Maestro code.

## Local unit verification

From the Maestro repository root, without paid CI or model API calls:

    node --test runtime/routing/__tests__/task-route-preview.test.js

For the full baseline, run the existing repository test command on a clean
checkout and record the exact SHA, Node version, OS and result. The initial
isolated logic validations do not replace Node integration or E2E certification.

Related: Maestro issues #48 and #53; Nexus issues #115 and #176;
OpenFusion (https://github.com/calesthio/OpenFusion).
