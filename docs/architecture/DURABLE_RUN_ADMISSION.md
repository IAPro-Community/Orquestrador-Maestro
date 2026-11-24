# Execução durável de Runs — admissão, worker, DAG e Goal Loop

**Status:** experimental. A admissão, o worker persistente, o dispatch por DAG e a avaliação do Goal Loop estão implementados e cobertos por testes automatizados. A suíte completa passou na CI pública em `1c3cb32` para Linux, Windows (Node 20 e 24) e macOS (Node 20 e 24). Continuam pendentes: homologação com CLIs reais de provider, macOS arm64, restart durante execução e dois clientes em hosts distintos. O E2E usa um provider shim. Não trate esta superfície como execução de produção homologada nem habilite autonomia por padrão.

O contrato tem duas responsabilidades separadas:

- `runs.submit` faz **admissão durável**: valida o plano revisado, persiste um manifesto imutável, cria um recibo de aprovação autoverificável e devolve um ACK idempotente com `submissionId` e `requestDigest`.
- O **worker** Maestro-owned faz o dispatch. O ACK nunca significa que um provider já começou ou terminou; submissões recém-admitidas ficam observavelmente em `PENDING_WORKER`.

O Bridge não executa workloads por conta própria. Ele expõe a admissão, as projeções de status e o cancelamento. Dispatch, leases e fencing pertencem ao runtime do Maestro.

## Fluxo

```text
cliente / Bridge
  │
  ├─ runs.submit ──► valida plano + provider + worktree + aprovação
  │                    │
  │                    ├─ persiste executableManifest imutável
  │                    ├─ persiste approvalReceipt autoverificável
  │                    └─ ACK PENDING_WORKER (submissionId/requestDigest)
  │
  └─ runs.submissions.poll ◄── ledger canônico no RunStore

worker Maestro (processo separado ou bridge --with-worker)
  │
  ├─ claim com lease/fencing
  ├─ cria um Run pending por tarefa
  ├─ dispatch em ordem topológica do DAG
  ├─ falha bloqueia apenas descendentes
  ├─ agrega o terminal de todos os Runs de tarefa
  └─ Goal Loop avalia o terminal
       └─ persiste decisão; nunca re-despacha sozinho
```

## Como habilitar

Com o worker no mesmo processo do Bridge:

```bash
orquestrador-maestro bridge --stdio --with-worker --project-path /repo
```

Com um worker separado e persistente:

```bash
orquestrador-maestro runs worker \
  --project-path /repo \
  --interval 1000 \
  --concurrency 1
```

Para executar um único ciclo, útil em CI e diagnóstico:

```bash
orquestrador-maestro runs worker --project-path /repo --once --interval 50
```

Limites dos comandos:

- `--interval` aceita de `50` a `60000` ms; o padrão é `1000`.
- `--concurrency` aceita de `1` a `8`; o padrão é `1`.
- `--once` executa um passo de polling e encerra.

A recuperação de avaliações terminais ausentes é feita em lotes limitados pelo worker: ela somente persiste decisões de Goal faltantes, sem reivindicar ou redespachar providers. Falhas de supervisão e avaliação são reportadas em diagnósticos sanitizados; erros repetidos não eliminam a pausa de polling. Ao encerrar o stdin do Bridge, o consumidor deixa de adquirir trabalho e drena o processamento em andamento. Isso não equivale a cancelar providers ou garantir sobrevivência após crash.

O worker não é supervisionado pelo sistema operacional. `bridge --with-worker` mantém o worker vivo apenas enquanto o processo do Bridge estiver vivo; `runs worker` precisa ser mantido por um supervisor externo se o uso for contínuo.

## Capability `runsSubmit`

`initialize.capabilities.runsSubmit=true` é anunciado quando o RunStore canônico oferece o contrato completo de admissão: `putExecutableManifest`, `saveApprovalReceipt`, `saveTask`, `getExecutableManifest`, `admitRunSubmission` e projetos. Isso anuncia **admissão**, não execução. Sem um worker ativo, a submissão permanece `PENDING_WORKER`. O cliente deve negociar a capability e não inferir execução apenas pelo ACK; `bridge --with-worker` é o que adiciona um consumidor no mesmo processo.

A capability é independente de o Bridge ter sido iniciado com `--with-worker`. Um Bridge sem worker ainda pode admitir e observar submissões duráveis, mas não as executa.

## `runs.submit` — admissão

Requisição mínima:

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "runs.submit",
  "params": {
    "clientKey": "nexus-mission-42-attempt-1",
    "approvedModelUse": true,
    "artifact": {
      "id": "composer-artifact-42",
      "version": 1,
      "content": "Plano aprovado e revisado pelo operador.",
      "sha256": "<SHA-256 do conteúdo UTF-8>"
    },
    "plan": {
      "tasks": [
        {
          "id": "task-api-001",
          "title": "Implementar endpoint",
          "objective": "Expor o endpoint com validação de payload",
          "dependsOn": [],
          "acceptanceCriteria": ["Entrada inválida retorna erro tipado"]
        },
        {
          "id": "task-ui-001",
          "title": "Integrar a tela",
          "objective": "Consumir o endpoint na tela existente",
          "dependsOn": ["task-api-001"],
          "acceptanceCriteria": ["A tela trata sucesso e erro"]
        }
      ]
    },
    "assignments": [
      { "taskId": "task-api-001", "providerId": "codex", "sandbox": "workspace-write" },
      { "taskId": "task-ui-001", "providerId": "codex", "sandbox": "workspace-write" }
    ],
    "approval": { "decision": "approved", "approvedBy": "operador" },
    "budget": { "maxCostUSD": 5 }
  }
}
```

Regras da admissão:

- `clientKey` é idempotente por projeto. Repetir a mesma chave com o mesmo request digest devolve a mesma submissão com `replayed: true`; mudar plano, artefato, orçamento, provider ou worktree com a mesma chave falha com conflito.
- `artifact.sha256` precisa corresponder exatamente ao conteúdo enviado. O conteúdo é limitado a 64.000 caracteres.
- O plano passa pelo `GraphValidator` do Maestro. Tarefas têm IDs únicos, dependências válidas e critérios de aceitação concretos. O limite é de 1 a 32 tarefas.
- Cada tarefa exige exatamente uma assignment com `providerId` registrado e `sandbox` explícito. Campos extras são rejeitados.
- `none` é aceito por qualquer provider. `enabled` exige AGY com controle de sandbox. `read-only` e `workspace-write` exigem Codex com controle de sandbox. OpenCode e Claude não declaram sandbox control neste contrato.
- A v1 durável só despacha o modelo padrão do provider. Um `model` específico é aceito como identificador, mas a admissão falha com `MODEL_LOCK_DISPATCH_UNSUPPORTED`.
- `approvedModelUse` precisa ser `true`; `approval.decision` precisa ser `approved`. O recibo persistido é ligado ao manifesto, plano, artefato e projeto.
- `budget` aceita somente `maxCostUSD`, um limite em USD entre `0` e `100`. Se omitido, o valor padrão é `0`, o que impede correções automáticas e leva o Goal Loop a `BLOCKED_NEEDS_USER`.
- O projeto precisa estar registrado no RunStore e o root físico do Bridge precisa corresponder exatamente a ele.

Resposta de admissão:

```json
{
  "schemaVersion": 1,
  "submissionId": "submission-...",
  "requestDigest": "<SHA-256>",
  "manifestId": "manifest-<SHA-256>",
  "manifestDigest": "<SHA-256>",
  "approvalDigest": "<SHA-256>",
  "status": "PENDING_WORKER",
  "replayed": false,
  "workspaceFingerprint": "<SHA-256>",
  "branch": "v1",
  "headCommit": "<SHA>"
}
```

Bloqueios de admissão são fail-closed e usam códigos estáveis, por exemplo `APPROVAL_NOT_VERIFIED`, `MODEL_USE_NOT_APPROVED`, `PROVIDER_NOT_REGISTERED`, `SANDBOX_NOT_SUPPORTED`, `PLAN_NOT_EXECUTABLE`, `WORKSPACE_RESERVED` e `MODEL_LOCK_DISPATCH_UNSUPPORTED`. O Bridge devolve o código de domínio em `error.data.code`, sem incluir prompt, token ou output bruto.

## DAG multi-tarefa e worktrees

- O worker cria **um Run por tarefa** e registra a correlação em `taskRuns`.
- A ordem de dispatch é topológica: uma tarefa só começa quando todas as dependências terminaram `completed`.
- Falha, timeout ou bloqueio de uma tarefa impede o dispatch dos descendentes, sem efeitos externos para eles.
- O status agregado da submissão é provado contra todos os Runs de tarefa persistidos, não contra o último evento recebido.
- A submissão reserva atomicamente o worktree canônico e até quatro worktrees adicionais, totalizando no máximo cinco. O mesmo fingerprint não pode estar em duas submissões ativas, mesmo em projetos diferentes.
- Os caminhos operacionais ficam em `workspacePaths` e não entram no digest. O fingerprint é derivado server-side de `realpath`, Git repository ID e Git common directory; aliases do mesmo checkout convergem, worktrees independentes recebem reservas distintas.
- Antes do dispatch, o Maestro revalida fingerprint, branch e HEAD de cada worktree. Uma mudança concorrente de checkout falha com `WORKSPACE_CHANGED_DURING_APPROVAL`.
- O supervisor mantém heartbeat de lease e sinaliza `AbortSignal` quando há cancelamento ou falha de renovação. `DISPATCHED` exige Run `pending` já persistido, Task do mesmo projeto e provider presente no plano aprovado.

## Ciclo de vida e cancelamento

| Status | Significado |
| --- | --- |
| `PENDING_WORKER` | Admissão durável concluída; nenhum worker reivindicou a submissão. |
| `CLAIMED` | Um worker possui lease/fencing; o provider ainda pode não ter começado. |
| `DISPATCHED` | Runs de tarefa foram persistidos e o dispatch começou. |
| `CANCEL_REQUESTED` | Cancelamento solicitado a um worker em voo; não é prova de interrupção. |
| `COMPLETED` | Todos os Runs de tarefa terminaram; isso não é aprovação do Goal. |
| `FAILED` / `BLOCKED` / `TIMED_OUT` | Terminal não aprovado; o Goal Loop avalia a correção. |
| `CANCELLED` | Cancelamento confirmado antes de qualquer dispatch. |
| `RECONCILIATION_REQUIRED` | Lease expirado ou estado ambíguo; exige inspeção humana. |

- `PENDING_WORKER` transita atomicamente para `CANCELLED`, sem dispatch.
- `CLAIMED`, `DISPATCHED` e `CANCEL_REQUESTED` aceitam apenas uma **solicitação** de cancelamento. Efeitos externos podem já ter ocorrido.
- Cancelamento tardio com resultados mistos permanece `CANCEL_REQUESTED` para revisão operacional; o Maestro não fabrica um terminal.
- Repetições de cancelamento devolvem o estado atual e não alcançam submissões de outro projeto.
- Claim expirado vira `RECONCILIATION_REQUIRED`; o worker nunca o redispatcha automaticamente.

## Goal Loop

Depois que uma submissão atinge `COMPLETED`, `FAILED`, `BLOCKED` ou `TIMED_OUT`, o worker executa uma avaliação read-only e persiste uma decisão imutável em `goalLoopDecisions`.

As decisões possíveis são:

- `PASS`: as evidências disponíveis satisfazem o objetivo. No caminho durável, isso exige todas as tarefas `completed`, verificação e evidência vinculadas ao mesmo Run/tarefa, `Resolution.outcome.state=validated` e contrato de aceitação não vazio.
- `CORRECTIVE_REVIEW`: a política delimitada identifica tarefas falhadas e preserva os ramos independentes já verificados. Essa decisão existe no contrato, mas o driver durável atual registra `totalCostUSD: null`; sem custo real medido, a política bloqueia a correção com `COST_USAGE_UNAVAILABLE`. O worker, portanto, hoje tende a persistir `BLOCKED_NEEDS_USER` para falhas.
- `BLOCKED_NEEDS_USER`: falta evidência, orçamento, custo verificável ou a falha se repete além do limite; a decisão precisa de intervenção humana.

O Goal Loop **não re-despacha** nenhuma tarefa. Uma correção só pode acontecer com um novo `runs.submit`, novo recibo de aprovação e orçamento explícito; o caminho durável atual bloqueia a correção enquanto não houver contabilização de custo confiável. As decisões guardam `failedTaskIds`, `affectedTaskIds`, `preservedTaskIds`, fingerprints determinísticos de falha e usage auditável, sem guardar prompt ou output bruto. Reavaliar o mesmo terminal devolve a decisão já persistida em vez de duplicar histórico.

`Run.status=completed` registra conclusão operacional do provider, não aprovação do Goal. `Verification.status=passed` atesta checks executados, mas não prova isoladamente cada critério de negócio.

## Observação de submissões

O Bridge v1 expõe, quando o RunStore suporta o contrato:

- `runs.submissions.list` com `limit` de 1 a 100.
- `runs.submissions.get` por `submissionId`.
- `runs.submissions.poll` com `cursor`, `limit` e `offset`; é um **snapshot poll**, com `delivery:"SNAPSHOT_POLL"` e `replayable:false`, não um event stream replayável. Quando o cursor não muda, a página vem vazia.
- `runs.submissions.cancel` por `submissionId`.

As projeções são redigidas e limitadas ao projeto do root físico do Bridge. Elas omitem `approvalDigest`, `clientKey`, fingerprints, leases, fence, worker ID e metadados internos. IDs de outro projeto retornam `null`, sem revelar existência.

Quando a submissão tem `runId` e o Run persistido contém `metadata.cognitiveTelemetry` com fonte `provider-reported` ou `derived`, as projeções incluem um campo opcional `usage`:

```json
{
  "schemaVersion": 1,
  "evidence": "RUN_STORE_OBSERVED",
  "tokensInput": 1200,
  "tokensOutput": 300,
  "tokensCached": null,
  "tokensReasoning": null,
  "durationMs": 8400
}
```

Campos sem medição real ficam `null`, nunca `0`. Sem nenhum token medido, `usage` é omitido por inteiro. O cursor de snapshot muda quando `usage` passa a existir; clientes antigos continuam funcionando.

## Recuperação operacional

```bash
# inspeção read-only de status, contagens e reservas
orquestrador-maestro runs admissions --project-path /repo --limit 100

# dry-run de claims expirados
orquestrador-maestro runs reconcile --project-path /repo --limit 100

# marca claims expirados como RECONCILIATION_REQUIRED
orquestrador-maestro runs reconcile --project-path /repo --limit 100 --apply
```

`runs admissions` e `runs reconcile` aceitam `--limit` de 1 a 200. Um claim expirado **nunca é redispatchado automaticamente**. O processo anterior pode ter produzido alterações externas. `RECONCILIATION_REQUIRED` mantém a reserva do workspace e exige inspeção humana. O `--apply` revalida a expiração sob o lock multiprocesso, para não sobrescrever um worker que renovou o lease. Nunca use `--apply` como permissão de replay.

## Segurança e limites

- A fila, os manifestos, os recibos e as decisões usam o mesmo `JsonFileRunStore`, com lock multiprocesso e fsync. Arquivos legados recebem as coleções vazias; conteúdo existente corrompido falha fechado.
- O RunStore e o Bridge não guardam prompt bruto, tokens, credenciais ou output de provider nas projeções de submissão.
- `approval.approvedBy` é uma asserção do cliente local; não é autenticação de usuário. Integrações remotas precisam de autenticação e autorização próprias.
- A execução do provider é um efeito externo real: pode consumir tokens, modificar o worktree e acessar a rede. Sandbox só vale quando o adapter declara suporte.
- Cobertura de plataforma: a suíte completa passou na CI pública em `1c3cb32` para Linux, Windows (Node 20 e 24) e macOS (Node 20 e 24). macOS arm64 permanece sem gate.
- Ainda não homologado: CLIs reais de AGY/OpenCode/Codex/Claude, macOS arm64, dois clientes em hosts distintos, restart durante execução e aprovação, e cursor replayável de eventos.
- O paralelismo por lane de worktrees independentes permanece pendente; `--concurrency` limita o número de submissões supervisionadas, não certifica execução paralela de providers.
- O preflight de Goal nativo permanece read-only e bloqueia autonomia overnight em Codex, Claude e OpenCode até comprovação de lifecycle headless.

## Evidência automatizada

Suítes principais:

- `runtime/runs/__tests__/executable-submission.test.js`: ACK durável, replay, conflito, fail-closed e resolução de conteúdo aprovado.
- `runtime/runs/__tests__/submission-worker.test.js`: claim, ordem topológica, bloqueio de descendentes e reserva atômica de worktrees.
- `runtime/runs/__tests__/submission-supervisor.test.js`: fencing, heartbeat, cancelamento e estados ambíguos.
- `runtime/runs/__tests__/application-submission-ports.test.js`: dispatch real pelo application port, cancelamento e integridade do verificador.
- `runtime/runs/__tests__/goal-loop-driver.test.js`: decisões imutáveis, PASS com evidência vinculada, fingerprints, orçamento e replay.
- `runtime/runs/__tests__/bridge-admission-gate.test.js`: anúncio de `runsSubmit` apenas com o contrato completo.
- `runtime/bridge/__tests__/cli-submissions-real-stdio.test.js`: admissão real via Bridge stdio e observação por segundo cliente.
- `tests/cli-durable-worker-e2e.test.js`: Bridge stdio real, worker em processo separado, provider shim e reconciliação via CLI real.

O E2E usa um shim de provider. Ele prova o caminho de admissão, claim, dispatch, observação e reconciliação, não a homologação de um provider real.

Ref: [Maestro #48](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/48), [Maestro #67](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/67), [Nexus #185](https://github.com/IAPro-Community/nexus/issues/185).
