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
- the provider-reported token counters (`tokenInput`, `tokenOutput`) and their
  `tokenSource`, so a provider that reports usage is distinguishable from one
  that reports nothing;
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

### Recorded on the release-candidate host (2026-11-26, Linux x86_64, Node v22.17.0)

Evidence file: `evidence` is never committed; regenerate it with the command above on the exact candidate SHA. The table below records one observed run.

| Provider | Version | Result | Reported cost | Reported tokens (in/out) |
| --- | --- | --- | --- | --- |
| `codex` | `codex-cli 0.172.0` | `COMPLETED` | `null` (`unavailable`) | `27433` in / `27` out |
| `claude` | `2.1.325 ([CC])` | `COMPLETED` | `0.20` (`provider-reported`) | reported (mostly cache reads) |
| `agy` | `1.5.18` | `COMPLETED` | `null` (`unavailable`) | `12862` in / `135` out |
| `opencode` | `opencode v2.4.1` | `COMPLETED` | `0` (`provider-reported`) | `168` in / `2` out |

Queued cancellation returned `CANCELLED` and the stale claim returned
`RECONCILIATION_REQUIRED` on the same RunStore. `verdict: PASS` covers these
four providers on this host only.

This is dispatch, execution and persistence evidence. It is **not** native Goal
lifecycle evidence: no Goal was started, observed, paused, cancelled or
recovered through a host Goal API, so every `goal.*` capability stays
`unknown` and `overnight` stays `BLOCKED`. `codex` reports no billed cost in
this mode, and `agy` reports no cost at all, so both keep `costUSD: null` with
`costSource: "unavailable"` instead of a number derived from tokens.
