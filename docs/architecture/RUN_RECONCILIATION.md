# Reconciliação operacional de Runs e submissões (v1)

**Status auditado:** branch `v1`; issue [#67](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/67). A documentação anterior afirmava incorretamente que o worker persistente era inexistente.

## Implementação existente

O Maestro já dispõe de um worker persistente (`runtime/runs/submission-worker.js`), um supervisor de submissões (`submission-supervisor.js`) com claim, lease/fencing, heartbeat, cancelamento e execução por DAG e um reconciliador canônico (`runtime/runs/reconciliation.js`). `maestro runs worker` executa o consumidor da fila, mas a existência deste entrypoint **não garante supervisão pelo sistema operacional nem continuidade durante desligamento ou suspensão da máquina**.

O `RunStore` contém as submissões, manifests, receipts de aprovação e Run IDs. Em um restart, o worker só reclama entradas `PENDING_WORKER`. Ele **não redispatcha** `CLAIMED`/`DISPATCHED` incertos quando expira lease. A reconciliadora move essas entradas para `RECONCILIATION_REQUIRED` até investigação operacional.

## Comandos existentes

- `orquestrador-maestro runs admissions --project-path /repo [--limit 100]`: status read-only.
- `orquestrador-maestro runs reconcile --project-path /repo [--limit 100]`: inspeção dry-run de leases expirados.
- `orquestrador-maestro runs reconcile --project-path /repo --apply`: quarentena atômica de claims expirados.
- `orquestrador-maestro runs worker [--project-path PATH] [--interval MS] [--concurrency N] [--once]`: execução do consumidor persistente da fila. Sem supervisão externa, o processo pode ser encerrado pelo sistema operacional; `--once` executa um único ciclo.
- `orquestrador-maestro bridge --stdio --with-worker`: inicia o mesmo worker no processo do Bridge. O worker deixa de consumir a fila quando o Bridge termina.

## Distinção importante para Goals

- `Run.status=completed` registra conclusão operacional do provider, **não** aprovação do Goal.
- `Verification.status=passed` atesta checks executados, mas não prova isoladamente cada regra de negócio.
- `Resolution.outcome.state=validated` só pode ser declarado no Goal após evidência aprovada e vinculada ao Run e artefato corretos.
- `goal-loop-driver.js` cria uma decisão auditável read-only no mesmo RunStore. Sem orçamento verificável, a correção permanece bloqueada e **não é retomada automaticamente**.
- O preflight `runtime/providers/goal-preflight.js` bloqueia Native Goal overnight em Codex, Claude e OpenCode, até comprovação real de lifecycle headless. Nenhum `/goal` interativo autoriza a execução headless.

## Incidentes, segurança e rollback

Nunca usar `runs reconcile --apply` como permissão de replay. Antes de decidir sobre uma entrada incerta, conferir a identidade do Run persistido, efeitos no worktree e efeitos externos. Não liberar reservas de workspace sob efeitos desconhecidos. O fluxo de recuperação com providers reais e crash/restart ainda é um **gate não cumprido** da issue #67.

**Rollout:** autonomia OFF por padrão. Desativar Goal não apaga o histórico nem modifica o comportamento de Runs simples. A implementação de modo supervised/bounded, correções fenced e o serviço overnight ainda dependem das fases futuras descritas no [ADR 0067](ADR_0067_GOAL_OWNERSHIP.md).
