# Maestro durable Run admission — fase 1 (sem dispatch)

**Status:** contrato interno; `runs.submit` é intencionalmente **UNSUPPORTED** no Bridge stdio v1 até existir worker supervisor persistente. `initialize.capabilities.runsSubmit=false`. Isso evita dar ACK falso a clientes Nexus.

## Fronteira

- **Maestro**, não Nexus, mantém a futura fila operacional, projeto, worktree, idempotência e fencing. A coleção opcional `runSubmissions` usa o mesmo `JsonFileRunStore` e o mesmo lock de arquivo multiprocesso, sem novo banco e sem duplicar memória semântica. Em arquivos v1 legados, a coleção ausente inicia vazia; se a coleção existir mas estiver corrompida, o store **falha fechado**, sem apagá-la ou recriar a fila.
- `admitRunSubmission` registra somente IDs, digests de SHA-256, providers selecionados, limites de duração/custo/tentativas e status operacional `PENDING_WORKER`. Não armazena token, PromptArtifact completo, saída de terminal, credencial ou log bruto.
- Cada chave `(projectId, clientKey)` representa um único request digest. Repetições retornam a mesma identidade; alterar plano, artefato, orçamento, worktree ou provider com a mesma chave é erro `RUN_SUBMISSION_CONFLICT`.
- O mesmo fingerprint de workspace **em qualquer projeto** não pode ter duas submissões simultâneas não terminais; IDs de projeto diferentes não eliminam exclusão por worktree. Reservas `RECONCILIATION_REQUIRED` continuam bloqueando novos writes até haver reconciliação auditável.
- O worker terá de receber um fencing token monotônico por lease. Status `CLAIMED` **não** significa provider iniciado. `DISPATCHED` exige Run `pending` já persistido no Maestro, Task do mesmo projeto e provider presente no plano aprovado. A conclusão também exige Run terminal persistido compatível com o status da submissão, incluindo `blocked` e `timed_out` como finais distintos. Cancel de `PENDING_WORKER` é seguro e imediato; cancel de `CLAIMED/DISPATCHED` é **solicitação** ao worker, não confirmação. Worker pode confirmar cancel antes do dispatch sem fabricar Run; cancel tardio após Run concluído mantém o resultado real `COMPLETED`.
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

## Autoridade de worktree (etapa posterior ao ledger)

A admissão originalmente armazenava `workspaceFingerprint` enviado pelo cliente, o que por si só não é uma prova de identidade nem protege contra aliases. O módulo interno `runtime/runs/workspace-authority.js` agora oferece `bindingFromRealGitWorktree` e `admitCanonicalWorktreeSubmission`: exige projeto previamente registrado no RunStore e derivação do fingerprint pelo próprio Maestro a partir de `realpath` do worktree, Git repository ID e diretório Git comum.

- Aliases do mesmo checkout convergem no mesmo fingerprint; worktrees independentes obtêm reservas distintas.
- Outro repositório, caminho que não seja raiz de worktree, projeto com path divergente, HEAD destacado e digest informado pelo cliente incorreto são rejeitados sem criar submissão.
- A fingerprint é propositalmente independente de commit/branch, preservando exclusividade mesmo durante mudanças no HEAD; a **aprovação** do plano ainda deve vincular os digests e o commit revisado separadamente.
- A admissão canônica agora exige callback interno `verifyApproval` que retorne exatamente `true`, recebendo digests do plano/artefato, repositório, branch e HEAD observados. Sem esse verificador confiável, a admissão falha com `APPROVAL_NOT_VERIFIED`. Um `approvalDigest` fornecido pelo cliente **não é aprovação**.
- Após aguardar o verificador, o Maestro confere novamente fingerprint, branch e HEAD e rejeita mudanças concorrentes de checkout com `WORKSPACE_CHANGED_DURING_APPROVAL`. Um executor futuro ainda deve validar autorização e limites imediatamente antes de cada side effect.
- A rota pública `runs.submit` **continua desabilitada**. Esta API interna não autoriza efeitos; ela apenas valida a identidade física do workspace. É obrigatório passar por aprovação persistida/capability e associar o `Run` preparado ao ledger antes de qualquer provider side effect.

Testes: `node --test runtime/runs/__tests__/workspace-authority.test.js` e suíte de admissão/reconciliação. Este documento não é evidência de worker durável ou homologação de providers.

## Supervisor one-shot interno (etapa de integração)

O módulo `runtime/runs/submission-supervisor.js` adiciona `superviseSubmissionOnce` como coordenação interna para uma única submissão admitida, **sem daemon e sem habilitar `runs.submit`**.

1. Exige `verifyApproval`, `prepareRun` e `dispatchRun` provenientes do próprio Maestro. Falha fechado sem verifier confiável e sem RunStore com suporte a leases/fencing.
2. Verifica aprovação antes de reivindicar o job; `claimRunSubmission` dá exclusividade atômica por worker/fence. Revalida aprovação antes de dispatch.
3. `prepareRun` deve persistir um Run `pending`; `markRunSubmissionDispatched` confirma proveniência, projeto/provider e grava o Run ID **antes** do primeiro efeito do provider.
4. Mantém heartbeat de lease, sinaliza `AbortSignal` quando cancelamento é solicitado ou a renovação falha. Cancelamento **antes de dispatch** termina a submissão sem executar provider. Cancelamento após dispatch só é confirmado se o Run persistido o comprovar.
5. `dispatchRun` é callback confiável separado: o supervisor **não inclui adaptadores reais e não executa workloads externos neste PR**. A finalização lê o status real persistido do Run e é validada no RunStore.
6. Uma falha após efeitos possíveis deixa `DISPATCHED` e **não reexecuta automaticamente**. Lease expirado requer `runs reconcile --apply` e inspeção manual; não há retry cego.

Testes cobrem execução uma vez, rejeição de aprovação falsa, cancelamento durante preparo e interrupção incerta sem replay. O próximo passo indispensável é integrar callbacks reais a `MaestroApplication.executePreparedRun` (mesmo Run ID), política de timeout/custo, prova de aprovação, servidor persistente e E2E com dois clientes/provedores. Este supervisor sozinho **não constitui execução durável concluída**.


## Incremental Maestro-owned polling worker (internal, opt-in)

`runtime/runs/submission-worker.js` provides
`createPollingSubmissionWorker({ store, projectId, projectRoot, workerId, verifyApproval, prepareRun, dispatchRun, ... })`
and `processApprovedAdmissionCycle`. Neither method is exposed in stdio Bridge,
nor does import or construction start a worker. A trusted Maestro bootstrap must
explicitly call `start()` and supply approval verification and
`createApplicationSubmissionPorts` callbacks. `runs.submit` remains unsupported.

Each bounded cycle uses the **existing canonical RunStore** and:

1. Scopes reads to the bootstrap-provided `projectId` and proves the registered
   project's physical directory matches `projectRoot` (the same canonical
   identity as admission). IDs and project authorization must never come
   from an arbitrary Bridge request.
2. Quarantines expired `CLAIMED`, `DISPATCHED`, and `CANCEL_REQUESTED`
   leases under the RunStore file lock. `RECONCILIATION_REQUIRED` cannot be
   re-dispatched or silently released after restart.
3. Accepts only `PENDING_WORKER` admissions with a **persisted immutable
   executable manifest** matching the project's plan/artifact digests, provider
   ordering, cost ceiling and physical workspace fingerprint.
4. Intentionally supports only **one task with the default model**. Multi-task
   DAGs and model overrides return a blocked *nonexecuting* decision.
5. Delegates claim/fencing, pre-dispatch approval recheck, run preparation,
   heartbeat and terminal receipt validation to `superviseSubmissionOnce`.
   The manifest's per-task `maxDurationMs` is propagated as an immutable
   `MaestroApplication.executionTimeoutMs`, bounded by the selected policy,
   and passed to the provider and verification calls. A provider error with
   uncertain side effects is **not** automatically retried.
6. Emits bounded sanitized operational summaries. It never returns a prompt,
   secret, approval receipt, raw output, or filesystem content.

`stop()` ceases polling and drains an in-process cycle; it is **not** proof
that an external provider was cancelled. Process kill/restart relies on lease
expiry and quarantine, not speculative replay. Any production entrypoint must
wire and validate real provider-specific adapters, restart orchestration,
authorization and observability before enabling a public submit capability.

**Limit currently not guaranteed:** these are component timeouts, not a
hard end-to-end wall-clock deadline covering queueing, review, provider,
verification and cleanup. Provider adapters must themselves honor the timeout;
total budget enforcement, cancellation acknowledgement and cost receipts remain
required before public `runs.submit`. A successful mock-provider test must
not be presented as provider-level or device-level homologation.

This is an incremental P0 coordinator, **not** acceptance of the full #48:
parallel DAG scheduling, dependency-aware join, per-task worktrees/provider
routing, durable Goal Loop iterations, actual device-level E2E and externally
verified approval remain incomplete.
