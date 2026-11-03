# Maestro durable Run admission — fase 1 (sem dispatch)

**Status:** contrato interno; `runs.submit` é intencionalmente **UNSUPPORTED** no Bridge stdio v1 até existir worker supervisor persistente. `initialize.capabilities.runsSubmit=false`. Isso evita dar ACK falso a clientes Nexus.

## Fronteira

- **Maestro**, não Nexus, mantém a futura fila operacional, projeto, worktree, idempotência e fencing. A coleção opcional `runSubmissions` usa o mesmo `JsonFileRunStore` e o mesmo lock de arquivo multiprocesso, sem novo banco e sem duplicar memória semântica.
- `admitRunSubmission` registra somente IDs, digests de SHA-256, providers selecionados, limites de duração/custo/tentativas e status operacional `PENDING_WORKER`. Não armazena token, PromptArtifact completo, saída de terminal, credencial ou log bruto.
- Cada chave `(projectId, clientKey)` representa um único request digest. Repetições retornam a mesma identidade; alterar plano, artefato, orçamento, worktree ou provider com a mesma chave é erro `RUN_SUBMISSION_CONFLICT`.
- O mesmo fingerprint de workspace **em qualquer projeto** não pode ter duas submissões simultâneas não terminais; IDs de projeto diferentes não eliminam exclusão por worktree. Reservas `RECONCILIATION_REQUIRED` continuam bloqueando novos writes até haver reconciliação auditável.
- O worker terá de receber um fencing token monotônico por lease. Status `CLAIMED` **não** significa provider iniciado. `DISPATCHED` exige Run `pending` já persistido no Maestro, Task do mesmo projeto e provider presente no plano aprovado. A conclusão também exige Run terminal persistido compatível com o status da submissão. Cancel de `PENDING_WORKER` é seguro e imediato; cancel de `CLAIMED/DISPATCHED` é **solicitação** ao worker, não confirmação. Worker pode confirmar cancel antes do dispatch sem fabricar Run; cancel tardio após Run concluído mantém o resultado real `COMPLETED`.
- Claim expirado vira `RECONCILIATION_REQUIRED`, nunca é redispatchado automaticamente: um processo pode ter realizado alterações externas antes do crash.
- Não existe aplicação automática de Plan, retry, Goal Loop ou arquivo de sessão nesta fase.

## Invariantes e testes

A suíte `node --test runtime/runs/__tests__/submission-admission.test.js` verifica replay idempotente por instâncias/processos independentes, conflito de workspace/planejamento, decisões sem provider fallback, isolamento, cancel antes/depois do claim, fencing e quarentena após lease expirado. O método Bridge `runs.submit` retorna erro `-32601` (não disponível), apesar do novo ledger existir.

## Próxima fatia (bloqueante para uso do Flow)

1. Persistir o plano executável com proveniência e aprovação verificada no Maestro, usando `plans.routePreview` apenas como pré-validação (não como prova de aprovação).
2. Implementar worker persistente **Maestro-owned**, com lease/epoch e cancel controlado, isolamento de worktrees, timeout e validação de custos/recibos por etapa. Não disparar child process sem supervisor.
3. Só então expor `runs.submit` com ACK verdadeiro, `runs.status`/event cursor, cancel seguro, retry explicitamente aprovado e Goal Loop com política de orçamento.
4. Homologar em Linux amd64, Windows amd64 e macOS arm64; dois clientes e AGY→OpenCode reais, restart durante execução/approval, logs sanitizados e prova exact-SHA antes de habilitar o botão de execução no Nexus.

Ref: [Maestro #48](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/48), [Nexus #185](https://github.com/IAPro-Community/nexus/issues/185).
