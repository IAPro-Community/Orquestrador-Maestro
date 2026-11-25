# Real provider certification

Durable execution is only certified for a provider after it runs the real CLI
through the canonical RunStore path on a recorded host. A shim proves the
dispatch plumbing; it does not certify a provider.

## How to run it

```bash
MAESTRO_REAL_PROVIDER_E2E=1 MAESTRO_REAL_PROVIDER_IDS=codex,claude,opencode,agy \
MAESTRO_REAL_PROVIDER_EVIDENCE=./evidence/real-providers.json \
node --test tests/cli-durable-worker-real-provider.test.js
```

The test is skipped by default and always skipped in CI, because it spends real
tokens and needs the operator's authenticated CLIs.

## What the evidence records

- platform, architecture, OS release and Node version;
- each provider's `--version` output, or `not-installed`;
- the durable submission status and persisted `runId`;
- the persisted Run's `providerId`, proving no silent fallback occurred;
- the execution count and, when reported by the provider, `costUSD` and
  `costSource` (never estimated from tokens);
- queued-cancellation and stale-claim recovery results on the same RunStore.

The evidence `verdict` is `PASS` only when every requested provider executed,
`PARTIAL` when some provider was missing on that host, and `NOT_EXECUTED` when
no provider ran. A stubbed CLI is visible in the recorded version string, so a
stub run can never be mistaken for provider homologation.

## Status

Nothing in this repository certifies macOS arm64, Windows amd64, two distinct
hosts, or the provider matrix by itself. Those rows stay unverified until the
command above is executed on that host and the evidence is attached to the
issue with the exact commit SHA.