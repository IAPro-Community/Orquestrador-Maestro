
# Auditoria independente #67 — Maestro v1

**Data local:** 2026-11-22 (America/Sao_Paulo).  
**Baseline analisado:** `dcf6631ddfb29ca9caba24c7ffa7ea73294c4cb3`.  
**Issue de origem:** https://github.com/IAPro-Community/Orquestrador-Maestro/issues/67  
**Teste histórico auditado:** https://github.com/IAPro-Community/Orquestrador-Maestro/actions/runs/45095130768 — conclusão **cancelled**, mas jobs Ubuntu/macOS **failure** antes do cancelamento. O status cancelado da execução não apaga falhas detectadas.

## Estado atual (2026-11-23)

Este documento é o snapshot da auditoria do baseline `dcf6631` e permanece como registro histórico. O que mudou desde então:

- o E2E durável real existe e roda no CI: `tests/cli-durable-worker-e2e.test.js` cobre Bridge stdio, worker em processo separado, segundo cliente e reconciliação (`2165abb`, `1c3cb32`);
- o defeito do heartbeat `unref()` apontado na matriz foi corrigido, e o E2E foi tornado seguro no Windows (`1c3cb32`);
- a suíte completa passou na CI pública para Linux, Windows (Node 20 e 24) e macOS (Node 20 e 24) em `1c3cb32`;
- a regressão de help registrada na seção “Bugs e riscos” está resolvida.

Continuam válidos: CLIs reais de provider, macOS arm64, restart durante execução, dois clientes em hosts distintos e cursor replayável. O contrato vigente está em [DURABLE_RUN_ADMISSION.md](DURABLE_RUN_ADMISSION.md).

## Matriz requerida

| Capacidade | Implementação atual | Evidência | Problema | Duplicação | Recomendação | Prioridade |
| --- | --- | --- | --- | --- | --- | --- |
| Router / Complexity Gate | **IMPLEMENTED** como classificação e limites MICRO..DEEP | `runtime/planner/complexity-gate.js`, `intent-router.js`, `skill-router-v3.js`, testes | Quality gate por stack não compõe automaticamente execução e specs | Nenhuma comprovada | KEEP; conectar signal de risco a Spec/verification sem obrigar planejamento pesado | P1 |
| Skills / Context Compiler | **PARTIAL** | `runtime/skills/registry.js`, `runtime/context/context-engine.js`, `orquestrador/bin/context-brief.js` | Fatos Node/DEV dominam preflight; referências de componentes/UI/fachadas não são comprovadas | Sobreposições entre brief/preflight/context necessitam medição, não apagar | IMPROVE integração/provenance, sem novo compilador | P1 |
| Memory / knowledge | **PARTIAL** | `runtime/bridge/memory-api.js`, `memory-write.js`, memória existente | Não está comprovado gate de promoção baseado em verificação de generalidade no fluxo Goal | Nenhuma nova store necessária | Reusar memória; validar namespace, evidência e prazo de validade antes da promoção | P2 |
| Planner / IntentSpec / Mission / DAG | **IMPLEMENTED** nos contratos, **PARTIAL** no end-to-end do Harness | `runtime/planner/intent-spec.js`, `graph-validator.js`, `plan-review-workflow.js`, `executable-submission.js` | Falta vincular critério a verificador concreto e UX curta do pedido natural até entrega | Alguns planners podem compartilhar semântica; nenhuma redundância demonstrada | KEEP; versionar accept contract e planos, auditar duplicações antes de deprecar | P1 |
| Aprovação/worktree | **IMPLEMENTED** na submissão single-attempt | `executable-manifest.js`, `manifest-admission.js`, `workspace-authority.js` | Escopo de comandos e scripts de verificação não está integralmente no digest de aprovação; dirty worktree antes de submit exige análise | Não | IMPROVE digests/verificadores/scope drift com schema v2 compatível | P0 |
| Worker/supervisor/RunStore | **IMPLEMENTED** com lease/fencing, processamento de DAG e idempotência | `submission-supervisor.js`, `submission-worker.js`, `runtime/store/json-file-run-store.js` | Heartbeat `unref()` permitia término do event loop durante cancelamento pendente; há simulação, falta E2E real | Não criar outro scheduler | Fix heartbeat e provas de cancel/crash/restart | P0 |
| Provider adapter single-shot | **IMPLEMENTED** para execução headless convencional | `runtime/providers/*-adapter.js`, `process-execution.js` | `headless:true` não equivale a `/goal` controlável; seleção de modelo default em despacho durável | Não | KEEP; capability por versão/superfície/sessão | P1 |
| Native Goal lifecycle | **MISSING** como integração certificada | `goal-preflight.js` é deliberadamente bloqueante; matriz `GOAL_PROVIDER_CAPABILITIES.json` tem `unknown` | Sem prova start/observe/cancel/recover/reattach com provider real | Implementar driver TUI seria duplicação/risco | Spike oficial no binário e adapter fino apenas se controlável | P1 |
| Goal Loop gerenciado | **PARTIAL** decisão read-only, sem correção automática | `goal-loop-policy.js`, `goal-loop-driver.js`, `submission-worker.js` | Faltam preapproval bounded, lineage, retries fenced e stopping por progresso | Não | Reutilizar worker; não despachar até gates reais | P0/P1 |
| Verification Engine | **PARTIAL** | `runtime/verification/engine.js`, `MaestroApplication.executePreparedRun` | Comandos derivados após execução podiam ser alterados pelo provider; teste verde pode executar fonte errada; falta cobertura Java/Python/UX | Não criar verificador paralelo | Opt-in de integridade da configuração no submit durável, depois binding exato por stack | P0 |
| Resolution / Proof Bundles | **PARTIAL** para Goal | `runtime/resolution/resolution-state.js`, `proof-bundle.js`, `runs/task-outcome-resolution.js` | `Run.completed` pode ocorrer sem aceites em modo compatibilidade; pass Goal exige prova e revisão exata | Não | Enforce final independente em Goal, não usar stdout do provider como prova | P0 |
| Evidence lineage / exact revision | **PARTIAL** | `goal-loop-driver.collectTaskResults` verifica Run/task/verifier; `RunStore` armazena proof | Ainda falta prova de ausência de alteração posterior no worktree e binding de commit/diff, test runner e critérios versionados | Não | Digest do verificador e estado do source no momento da verificação | P0 |
| Telemetria e custos | **PARTIAL** | `runtime/telemetry/cognitive-telemetry.js`, `goal-loop-driver.js` | Tokens/tempo não formam preço USD confiável; não existe gate global de preço das tentativas | Não | `null` explícito; custo desconhecido bloqueia novo gasto, **não** um trabalho já validado | P0/P1 |
| CLI e Bridge | **PARTIAL** | `bin/orquestrador-maestro.js`, `runtime/bridge/bridge.js`, `submission-status.js` | `runsSubmit` depende de contrato/storage e não atesta worker saudável; eventos polling snapshot sem replay; alteração de help quebrou teste legado no CI anterior | Não | Restaurar help, adicionar health separado antes de anunciar readiness | P0/P2 |
| Overnight com providers reais | **UNVERIFIED** | `tests/cli-durable-worker-e2e.test.js` usa shim; issues #48/#67 abertas | Nenhuma prova de controle real em duas CLIs, restart, cancel, autenticação e orçamento sob queda | Evitar implementar motor paralelo | Permanecer OFF até ensaio reproduzível no SHA exato | P1 |

**Classificação REDUNDANT:** não atribuída a nenhum componente, porque o inventário atual não comprova duplicação semântica com testes/métricas suficientes. Nomes semelhantes não autorizam remoção.

## Bugs e riscos adversariais reproduzíveis

1. **CI histórico falhou:** job Full tests Node 22 do run `45095130768` registra `not ok 253`, cancelamento com `Promise resolution is still pending but the event loop has already resolved`. O único timer observador de `CANCEL_REQUESTED` era um heartbeat `unref`; correção retém timer enquanto o supervisor aguarda e o limpa em `finally`.
2. **Regressão de help:** `tests/legacy-compatibility.test.js` exige texto `providers list`; o novo help tinha `providers <list|goals>`. O HEAD baseline já voltou a apresentar ambas as linhas (não criar regressão revertendo essa correção).
3. **Custo desconhecido:** `goal-loop-policy.js` bloqueava inclusive um `PASS` de evidência já validada quando USD é `null`; decisão corrigida: `PASS` não exige novo gasto, mas `CORRECTIVE_REVIEW` exige budget confiável.
4. **Verifier tamper:** `MaestroApplication` inferia `npm run test` depois de o agente editar `package.json`. No caminho durável agora se congela configuração antes do dispatch e alteração resulta em `VERIFICATION_CONFIG_DRIFT`. **Ainda não é prova de integridade genérica**, pois scripts internos/outros arquivos também podem ser editados.
5. **Preflight Native Goal:** os três providers listados retornam blocked; não existe licença para anunciar `/goal` headless só porque o comando existe na TUI. Testes fakes validam política de bloqueio, não integração nativa.

## Duplicação e dependências

- Não foi introduzida dependência do Nexus nem segundo `RunStore`, `VerificationEngine` ou scheduler na fase #67.
- O `goal-preflight.js` atual está propositalmente separado apenas como consulta read-only e não implementa controle; pode ser incorporado como método dos adapters quando houver prova real, mas removê-lo agora não melhora compatibilidade.
- Múltiplos mecanismos de planejamento (IntentSpec/Graph/Goal) têm semânticas diferentes; eventual unificação exige testes de equivalência e migração de dados.
- Bibliotecas externas foram **pesquisadas, não adicionadas**. A comparação completa está no [benchmark](../research/HARNESS_ORCHESTRATOR_BENCHMARK_2026.md).

## API, testes e limites

APIs existentes a preservar: `orquestrador-maestro go/plan/run`, `providers list`, `providers goals`, `runs worker/admissions/reconcile`, Bridge v1 e `runs.submit`, serialização RunStore v1, estados do Run. A semântica de `COMPLETE` de uma submissão legada não muda; a **projeção de Goal** é que não deve mentir.

O teste `45095130768` não é evidência de sucesso global. Código dos fixes P0 deve ser confrontado com novo workflow no HEAD final. Nenhuma linha deste documento autoriza declarar que a suíte inteira passou se o workflow ainda estiver em execução ou cancelado.

## Direção

A ADR 0067 sobre single owner foi correta **mas estreita**. A [ADR 0068](ADR_0068_HARNESS_ORCHESTRATOR.md) consolida os seis domínios de um Harness Orchestrator, mantendo todos os componentes canônicos e colocando contrato de engenharia e verificação antes de autonomia. Não reinventar Goal, Task, memória ou scheduler.
