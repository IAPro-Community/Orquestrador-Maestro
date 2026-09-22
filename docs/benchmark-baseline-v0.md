# Baseline V0 — registro de prontidão (Phase 2, Roadmap)

Data: 2026-09-21. Base: `main` em `a792e00` (pacote `0.4.4`, 52 skills canônicas).

Objetivo da Phase 2: executar Vanilla vs Maestro Core e guardar dados brutos + relatório inicial. Este documento registra o estado de prontidão e o que bloqueia a execução oficial.

## O que foi verificado

- `npm run bench:validate` — 13/13 cenários válidos (`api-handler`, `bug-context-noise-001`, `bug-cross-file-001`, `bug-fix-auth`, `cross-session-migration`, `feature-add-api-endpoint`, `feature-add-button`, `fibonacci-test`, `investigate-performance`, `refactor-extract-service`, `refactor-extract-util`, `resume-auth-feature-001`, `resume-auth-feature`).
- `npm run bench:list` — lista os 13 cenários com tags.
- Dry-run: `run --scenario benchmark-harness/scenarios/fibonacci.json --dry-run` — cenário válido, sem execução.
- `node scripts/skill-catalog.js validate` — 52 skills, proveniência e workflows válidos.
- `preflight`: Node.js v22.17.0 ✅, OpenCode CLI ✅, cenários 13/13 ✅, diretório de evidência ✅.

## Bloqueadores da execução oficial

`preflight` falha em 2 itens, ambos externos ao repo:

1. **API Key não configurada** (`BENCHMARK_API_KEY` vazia). Sem ela o driver não executa chamadas reais de modelo. Desbloqueio: copiar `benchmark-harness/.env.example` para `benchmark-harness/.env` e preencher `BENCHMARK_API_KEY`, `BENCHMARK_BASE_URL` e `BENCHMARK_MODEL` (nunca commitar o `.env`).
2. **Docker indisponível**. O perfil oficial exige `--container`. Desbloqueio: instalar Docker e usar `--profile official`.

## Próximo comando quando desbloqueado

```bash
npm run bench:list
node --import tsx benchmark-harness/src/cli/index.ts suite --profile official --evidence benchmark-harness/evidence/baseline-v0
```

Evidência bruta fica em `benchmark-harness/evidence/` (ignorado pelo Git por conter segredos/outputs locais — ver `docs/privacy-model.md`). Só relatórios sanitizados entram no repo. Claims públicos exigem o evidence gate (`docs/benchmark.md#evidence-gate`): N>=20 pareado, execução real, tokenSource provider-reported, isolamento e reprodutibilidade.
