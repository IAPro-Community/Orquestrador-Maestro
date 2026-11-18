# Maestro durable Run admission — fase 1 (sem dispatch)

**Status:** contrato interno em evolução. `runs.submit` agora executa **admissão real** (manifesto imutável + recibo de aprovação autoverificável + ACK durável com `submissionId`/`requestDigest`), mas continua **indisponível e não anunciado** (`runsSubmit:false`, `-32601`) enquanto nenhum worker persistente estiver wired (serviço `worker` no Bridge ou `maestro bridge --stdio --with-worker`). Isso evita dar ACK falso a clientes Nexus. O despacho de providers continua proibido no Bridge; apenas o worker executa.

## Fronteira

- **Maestro**, não Nexus, mantém a fila operacional, projeto, worktree, idempotência e fencing. As coleções `runSubmissions`, `executableManifests` e `approvalReceipts` usam o mesmo `JsonFileRunStore` e o mesmo lock de arquivo multiprocesso, sem novo banco e sem duplicar memória semântica. Em arquivos v1 legados, coleções ausentes iniciam vazias; se existirem mas estiverem corrompidas, o store **falha fechado**, sem apagá-las ou recriar a fila.
- `submitExecutablePlan` (`runtime/runs/executable-submission.js`) valida o DAG revisado + atribuições explícitas por tarefa, deriva os bindings de worktree **server-side**, persiste o manifesto imutável e o conteúdo aprovado das tarefas (namespaced pelo digest do plano) e admite a submissão. O recibo de aprovação é autoverificável: seu id é o SHA-256 do payload canônico; `approvedAt`/`approvedBy` são metadados não canônicos, preservando replay idempotente com um único digest.
- Cada chave `(projectId, clientKey)` representa um único request digest. Repetições retornam a mesma identidade; alterar plano, artefato, orçamento, worktree ou provider com a mesma chave é erro `RUN_SUBMISSION_CONFLICT`.
- Reserva de workspace: a submissão reserva atomicamente o worktree canônico do projeto + até 4 worktrees adicionais (`extraWorkspaceFingerprints`); os caminhos de despacho ficam em `workspacePaths` (operacional, fora do digest). O mesmo fingerprint **em qualquer projeto** não pode ter duas submissões simultâneas não terminais. Reservas `RECONCILIATION_REQUIRED` continuam bloqueando novos writes até houver reconciliação auditável.
- O worker (`maestro runs worker`, `createSubmissionWorker`) recebe fencing token monotônico por lease. Status `CLAIMED` **não** significa provider iniciado. `DISPATCHED` exige Run `pending` já persistido no Maestro, Task do mesmo projeto e provider presente no plano aprovado. Multi-tarefa: um Run por tarefa (`taskRuns`), em ordem topológica; tarefa só executa com todas as dependências `completed`; descendentes de tarefa falhada são bloqueados sem efeitos externos; o agregado (`COMPLETED/FAILED/TIMED_OUT/BLOCKED`) é provado contra todos os Runs de tarefa persistidos. `MODEL_LOCK_DISPATCH_UNSUPPORTED` mantém v1 no modelo padrão do provider. Cancelamento de `PENDING_WORKER` é seguro e imediato; cancel de `CLAIMED/DISPATCHED` é **solicitação** ao worker. Cancel confirmável somente antes de qualquer dispatch; cancel tardio com resultados mistos permanece `CANCEL_REQUESTED` para revisão operacional (quarentena via reconciler), sem fabricar terminal.
- Claim expirado vira `RECONCILIATION_REQUIRED`, nunca é redispatchado automaticamente: um processo pode ter realizado alterações externas antes do crash.
- O Goal Loop corretivo (`assessGoalCorrection`) ainda não possui caller no runtime; execução é single-attempt por tarefa.

## Invariantes e testes

Suítes: `runtime/runs/__tests__/executable-submission.test.js` (ACK durável, replay, conflito, fail-closed), `submission-worker.test.js` (executa exatamente uma vez, DAG em ordem, falha invalida só descendentes, reserva atômica de dois worktrees), `submission-supervisor.test.js`, `manifest-admission.test.js`, `submission-admission.test.js`, `bridge-admission-gate.test.js` (capability `runsSubmit` verdadeira apenas com worker + contrato completo).

## Próxima fatia

1. Goal Loop materializado no runtime: após terminal de tarefa, avaliar evidências, persistir decisão/receipt e re-admitir somente as tarefas afetadas dentro do orçamento.
2. Paralelismo por lane (worktrees independentes) no worker, mantendo o limite de concorrência configurável.
3. Cursor de eventos replayável por submissão (hoje `runs.submissions.poll` é snapshot).
4. Homologar em Linux amd64, Windows amd64 e macOS arm64; dois clientes e AGY→OpenCode reais, restart durante execução/approval, logs sanitizados e prova exact-SHA antes de habilitar o botão de execução no Nexus.

Ref: [Maestro #48](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/48), [Nexus #185](https://github.com/IAPro-Community/nexus/issues/185).

## Autoridade de worktree (etapa posterior ao ledger)

A admissão originalmente armazenava `workspaceFingerprint` enviado pelo cliente, o que por si só não é uma prova de identidade nem protege contra aliases. O módulo interno `runtime/runs/workspace-authority.js` agora oferece `bindingFromRealGitWorktree` e `admitCanonicalWorktreeSubmission`: exige projeto previamente registrado no RunStore e derivação do fingerprint pelo próprio Maestro a partir de `realpath` do worktree, Git repository ID e diretório Git comum.

- Aliases do mesmo checkout convergem no mesmo fingerprint; worktrees independentes obtém reservas distintas.
- Outro repositório, caminho que não seja raiz de worktree, projeto com path divergente, HEAD destacado e digest informado pelo cliente incorreto são rejeitados sem criar submissão.
- A fingerprint é propositalmente independente de commit/branch, preservando exclusividade mesmo durante mudanças no HEAD; a **aprovação** do plano ainda deve vincular os digests e o commit revisado separadamente.
- A admissão canônica exige callback interno `verifyApproval` que retorne exatamente `true`, recebendo digests do plano/artefato, repositório, branch e HEAD observados. Sem esse verificador confiável, a admissão falha com `APPROVAL_NOT_VERIFIED`. Um `approvalDigest` fornecido pelo cliente **não é aprovação**; o verificador de produção (`createTrustedApprovalVerifier`) resolve o recibo persistido e vinculado ao manifesto imutável.
- Após aguardar o verificador, o Maestro confere novamente fingerprint, branch e HEAD de **cada** worktree reservado e rejeita mudanças concorrentes de checkout com `WORKSPACE_CHANGED_DURING_APPROVAL`. O executor ainda valida autorização e limites imediatamente antes de cada side effect.

## Supervisor one-shot interno (etapa de integração)

O módulo `runtime/runs/submission-supervisor.js` mantém `superviseSubmissionOnce` como coordenação interna para uma única submissão admitida, **sem daemon próprio** — o loop residente vive em `runtime/runs/submission-worker.js` (`maestro runs worker`).

1. Exige `verifyApproval`, `prepareRun` e `dispatchRun` provenientes do próprio Maestro. Falha fechado sem verifier confiável e sem RunStore com suporte a leases/fencing.
2. Verifica aprovação antes de reivindicar o job; `claimRunSubmission` dá exclusividade atômica por worker/fence. Revalida aprovação antes de cada dispatch do DAG.
3. `prepareRun` deve persistir um Run `pending`; `bindPreparedRunSubmission` (por tarefa) e `markRunSubmissionDispatched` confirmam proveniência, projeto/provider e gravam o Run ID **antes** do primeiro efeito do provider.
4. Mantém heartbeat de lease, sinaliza `AbortSignal` quando cancelamento é solicitado ou a renovação falha. Cancelamento **antes de dispatch** termina a submissão sem executar provider.
5. `dispatchRun` é callback confiável separado: o supervisor não executa workloads externos por conta própria. A finalização lê os status reais persistidos dos Runs de tarefa e é validada no RunStore.
6. Uma falha após efeitos possíveis deixa `DISPATCHED` e **não reexecuta automaticamente**. Lease expirado requer `runs reconcile --apply` e inspeção manual; não há retry cego.
