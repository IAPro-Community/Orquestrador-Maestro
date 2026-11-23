# ADR 0067 — Goal Loop no Maestro: autoridade única e gates verificáveis

**Status:** direção arquitetural registrada, execução overnight NÃO HOMOLOGADA.  
**Issue:** [#67](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/67)  
**Baseline auditado:** branch `v1`, commit `f9a93336167cc0449ac1672c6f00784494343dbb`; revalidar HEAD antes de cada fase.

## Inventário comprovado

| Tema | Situação | Evidência |
| --- | --- | --- |
| DAG, worktree e aprovação imutável | implementado | `runtime/runs/executable-submission.js`, `executable-manifest.js` |
| Worker com leases, fencing e cancelamento | implementado | `submission-supervisor.js`, `submission-worker.js` |
| RunStore / verificação / resolução | implementados para Runs | `runtime/store/`, `verification/engine.js`, `resolution/` |
| Goal Loop de decisão e histórico | parcial | `goal-loop-driver.js` e `goal-loop-policy.js` |
| Re-admissão corretiva sob aprovação/budget | ausente | o driver só produz decisões `CORRECTIVE_REVIEW` |
| Propagação de verificação no submit durável | defeito confirmado | `application-submission-ports.js` passa `verificationCommands: []` |
| Uso USD real | ausente | driver usa literal `totalCostUSD: 0`; `cognitiveTelemetry` tem métricas de tokens |
| Native Goal controlado em headless | ausente | adaptadores só implementam execute normal |
| E2E com providers reais e overnight | não testado | Linux x86_64: nenhum dos três CLIs instalado |

## Decisões

1. A execução tem **um único owner de continuação** (`native-provider` OU `maestro-managed`). Native requer lifecycle observável/controlável por sessão e versão; Managed reutiliza o worker existente, não outro scheduler.
2. **Run.status=completed não equivale a Goal VALIDATED.** Aceitação exige verificação passada, critérios cobertos por evidência independente vinculada ao Run/artefato/revisão, e `Resolution.outcome.state=validated`.
3. Aprovação é delimitada por Spec/DAG/planDigest, worktree/HEAD, provider/versão/superfície, comandos permitidos, sandbox, duração, iterações, calls, custos medidos e proibições. Revisão de escopo ou alteração da aprovação invalida a autorização.
4. **Autonomia default OFF.** `/goal` TUI não implica suporte headless; não enviar texto literal `/goal` para `codex exec`, `claude --print` ou `opencode run` presumindo modo Goal.
5. Se a API nativa não permite início, observação, pause/cancel e recuperação seguros, bloquear native. Fallback Managed somente antes do dispatch, se explicitamente autorizado e certificado. Nenhuma troca de owner no meio da execução.
6. Crash com efeito externo incerto continua `RECONCILIATION_REQUIRED`, nunca replay cego. Encerramento do cliente não é evidência de processo residente.
7. Orçamento desconhecido é **unknown**, não zero. Sem pricing e medição de limite financeiro confiável, não há promessa rígida de USD overnight. Enforce também limites de duração, quantidade de chamadas, iterações e alterações.
8. Push, merge, deploy, acesso à produção, alteração destrutiva ou exfiltração de dados não são autorizados pelo simples pedido de autonomia.

## Provider reality check

Ver `docs/product/GOAL_PROVIDER_CAPABILITIES.json`. Documentos oficiais confirmam Goals interativos em [Codex](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex), [Claude Code](https://code.claude.com/docs/en/commands) e [OpenCode](https://opencode.ai/changelog), mas não homologam as superfícies headless dos adaptadores Maestro. Há [bug report reproduzível](https://github.com/openai/codex/issues/60308) sobre `codex exec` encerrar com Goal ativo em 0.167.0. Isso é um risco confirmado externamente, não teste feito aqui.

## Fases e critérios de avanço

- **P0.0:** baseline, ADR, matriz por provider/versão/superfície, preflight fail-closed e testes unitários. Sem execução.
- **P0.1:** preservar inference de comandos, bloquear falso positivo de conclusão; evidência do Run, verificação, critério e revisão exata.
- **P0.2:** aprovação delimitada no mesmo RunStore; comandos/efeitos proibidos, revogação, pause/cancel persistidos.
- **P0.3:** implementar Native Goal apenas para versão/SDK comprovados, com start/observe/cancel/recover reais. Senão permanecer desabilitado.
- **P0.4:** Managed Loop via submissões/worker existentes; tentativas e lineage fenced, sem repetição de efeito incerto.
- **P0.5:** contabilização real de uso/custo ou bloqueio; preview/status/report e decisão de outcome.
- **P1:** serviço durável supervisionável, crash/restart/reconcile, testes overnight com >=2 providers realmente instalados, cenário de correção e bloqueio e relatório por SHA.

## Compatibilidade / rollback

A CLI, o Bridge, o contrato `runs.submit`, os status legados e as APIs de RunStore permanecem preservados. A funcionalidade de Goal autônomo só pode entrar como opt-in, com desligamento por feature flag sem apagar decisões ou Runs; rollback nunca cancela/reexecuta efeitos incertos automaticamente. Não atualizar `docs/product/CAPABILITY_MATRIX.json` para `supported` até que os testes reais e o gate correspondente sejam registrados.

## Evidência deste ambiente

Comandos disponíveis: `node --version` = `v22.16.0`; `uname` = Linux x86_64. `command -v codex`, `command -v claude`, `command -v opencode` retornaram ausente. E2E real = **NÃO TESTADO**. Os testes com fake adapters apenas provam comportamento interno, não autorização para overnight.
