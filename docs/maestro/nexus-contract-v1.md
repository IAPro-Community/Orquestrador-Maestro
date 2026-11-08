# Nexus integration contracts v1

The CLI exposes a small, versioned contract over standard input and standard output. It does not require a daemon.

## Capabilities

```sh
orquestrador-maestro capabilities --json
```

The response includes package `version`, supported `modes`, `contracts.advice`, `contracts.verification`, canonical skills, and the current authoritative `gates` and `processes` enumerations. Advice and verification contract versions are `1.0.0` independently of the package version.

## Advice

```sh
printf '%s\n' '{"version":"1.0.0","context":{"project_id":"project-1"},"intent":"review security","scope":"project","lifecycle":"TASK"}' | orquestrador-maestro advise --json
```

Advice routes the supplied intent through Maestro's `SkillRouterV3`. It returns canonical skill recommendations only when the router has matching evidence; an unmatched intent returns empty recommendation arrays with an explanation. The command does not execute a skill, provider, process, gate, or task.

The request supports `scope` values `project`, `agent`, or `task`, and lifecycle values `PLAN`, `TASK`, `RECOVERY`, or `VERIFY`. `context.project_id` is required; `agent_id` is optional. Do not send credentials, environment files, or raw terminal transcripts.

## Verification

```sh
printf '%s\n' '{"version":"1.0.0","lifecycle":"VERIFY","checks":["PASS: npm test (exit 0)"],"evidence_refs":["evidence://run-1/tests"],"risk_signals":[]}' | orquestrador-maestro verify --json
```

The Nexus runtime remains the only check executor. A check counts as passed only when the caller reports it with the `PASS:` prefix; evidence references must be present, and unresolved risk signals keep the verdict false. Maestro does not execute commands, access paths, or dereference evidence URIs. A `passed: true` verdict means this submitted verification package satisfies the Maestro policy, based on the caller's reported results and evidence references.

`verify --json` is selected only for that exact argument form. Existing installer verification flags such as `verify --strict` and `verify --home-path PATH` continue to invoke the legacy installation verifier.

## Failure behavior

Invalid JSON, unsupported contract versions, malformed arrays, missing required request fields, or unsupported lifecycle/scope values exit nonzero without emitting a partial contract. Consumers must treat missing or unsupported advertised contract versions as degraded and must not synthesize advice or verification results.
