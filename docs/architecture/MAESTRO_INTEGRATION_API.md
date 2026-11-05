# Maestro Integration API

> Status: ativo na linha 1.0 Alpha. O contrato suportado é o protocolo v1 via
> `orquestrador-maestro bridge --stdio`. O daemon/socket e o protocolo v2 da
> antiga linha `cli-novo` foram removidos.

`orquestrador-maestro bridge --stdio` expõe JSON-RPC 2.0 delimitado por linha.
O método `initialize` negocia `PROTOCOL_VERSION=1`.

As operações suportadas cobrem o Runtime consolidado, incluindo inspeção de
projeto, projetos, missões, skills, providers, runs, resolution/evidence,
proof bundles, artefatos e verificação.

Para terminal, o Bridge preserva somente o contrato de comando gerenciado:

- `terminals.start`;
- `terminals.stop`;
- `terminals.input`.

Não fazem parte do contrato V1: `projects.dashboard`, sessões PTY,
`agentSessions.*`, panes, attach de terminal, protocolo v2 e cliente socket.

O Bridge é uma API aditiva. A execução, descoberta de Skills, verificação,
observação Git e persistência continuam pertencendo ao Runtime.

## Contexto canônico para clientes externos

O método aditivo `context.brief` está disponível no Bridge **v1** sem
criar uma dependência do Nexus ou um novo armazenamento de memória.

- Entrada: `{ "task"?: string, "taskId"?: string, "since"?: string, "maxChars"?: number, "projectPath"?: string }`.
- O `projectPath`, quando fornecido, precisa corresponder ao projeto configurado
  na inicialização do Bridge. Outros diretórios são rejeitados.
- O orçamento máximo da chamada Bridge é de **16.000 caracteres** (mínimo 1.000).
- Saída: o mesmo resultado do CLI `context brief --json`, incluindo `content`,
  `budget`, `state` e `manifest` (versão, SHA/digests, caminhos e fatias de
  proveniência). Conteúdo e caminhos passam pela sanitização do builder canônico.
- Erros de parâmetro seguem JSON-RPC `-32602`. Problemas internos não expõem
  detalhes sensíveis via resposta ao chamador.

Exemplo de requisição:

```json
{"jsonrpc":"2.0","id":1,"method":"context.brief","params":{"task":"Continuar revisão","taskId":"review-1","maxChars":8000}}
```

A operação é apenas leitura de contexto. O Runtime, as Skills, a memória
semântica e o mecanismo de classificação continuam pertencendo ao Maestro.

## Projeção read-only de projeto para consumidores (Bridge v1, incremental)

`initialize.capabilities.projectContext = true` anuncia o método aditivo
`project.context`. **Não** torna o Nexus requisito para o Maestro e não importa
nenhum código do Nexus. A origem semântica é o `context.brief` canônico do
próprio Maestro; a identidade vem do inspector já existente do runtime.

Requisição:

```json
{"jsonrpc":"2.0","id":2,"method":"project.context","params":{"projectPath":"/caminho/do/projeto","task":"Revisar arquitetura","taskId":"review-1","maxChars":8000}}
```

Resposta (forma ilustrativa, sem valores reais de contexto):

```json
{
  "schemaVersion": 1,
  "authority": "MAESTRO",
  "project": { "id": "prj-example", "name": "example", "known": true, "status": "idle" },
  "context": { "content": "...", "manifest": { "version": 1, "contentDigest": "..." } }
}
```

Os campos de `context` são exatamente o retorno do builder canônico
(`content`, `budget`, `state`, `manifest` e demais campos já suportados).
A projeção `project` inclui somente `id`, `name`, `known` e `status`;
não retransmite `latestRun`, paths, eventos ou outros metadados do inspector.
`id/name/status` podem ser nulos em instalações/fixtures sem projeto registrado,
e `known` pode ser falso. O projeto é sempre o root vinculado à instância do
Bridge. Não há suporte para inspecionar outro projeto com esta chamada.

Validações de `project.context` reutilizam as de `context.brief`, inclusive
limites de `task`, `taskId`, `maxChars`, escopo `projectPath` e
redaction. A falha na composição ou inspeção não retorna um contexto parcial
marcado como válido. O Bridge v1 não oferece snapshot atômico entre contexto Git
e RunStore, composição de DAG, escrita de memória, nem streaming de runs.

**Compatibilidade:** clientes consultam `initialize`; se `projectContext`
não for anunciado, podem usar `context.brief` somente quando disponível e
sem sintetizar identidade não recebida. A disponibilidade do Bridge executável
não deve ser inferida apenas pela existência do diretório de Skills.

Este incremento é parte de [#45](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/45).
A arquitetura normativa e as etapas ainda faltantes estão em
[ADR-2026-11-01](../adr/ADR-2026-11-01-maestro-ecosystem-authority.md).

## Plans.validate — validação canônica sem execução

`initialize.capabilities.plansValidate=true` anuncia a operação aditiva
`plans.validate` no Bridge v1. A implementação reaproveita o
`GraphValidator` e o `TaskGraphProposal` do **Maestro**, nunca cria um
planejador paralelo no Nexus, não usa provider e não inicia ou persiste runs.

Requisição:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "plans.validate",
  "params": {
    "projectPath": "/projeto",
    "artifact": {
      "id": "composer.artifact-1",
      "version": 1,
      "sha256": "<SHA-256 do conteúdo UTF-8>",
      "content": "Objetivo aprovado..."
    },
    "proposal": {
      "tasks": [{
        "id": "task-1",
        "title": "Implementar endpoint com validação de payload",
        "objective": "Expor endpoint com entradas verificadas",
        "dependsOn": [],
        "acceptanceCriteria": ["Entrada inválida retorna erro tipado"],
        "requiredCapabilities": ["backend"]
      }]
    }
  }
}
```

A resposta contém `schemaVersion=1`, `authority="MAESTRO"`,
`source="caller-provided-proposal"`, `reviewOnly=true`,
`executable=false` e `requiresApproval=true`. Inclui a identidade/digest
do artefato, a versão/digest do manifesto canônico do projeto e o resultado
`validation { valid, blockers, warnings }`. Somente quando `valid=true`
retorna tarefas normalizadas; caso contrário, `tasks=null`.

A operação bloqueia consulta cross-project, artefato com SHA inválido, payload
descontrolado (limites: artefato 64k caracteres, 1 a 32 tarefas, 1 a 20 critérios
por tarefa), dependências quebradas/cíclicas, títulos genéricos e propostas
incompatíveis com o esquema de engenharia. Parâmetros inválidos usam JSON-RPC
`-32602`; falhas internas não retornam dados sensíveis.

**Importante:** isso **não gera** tarefas nem faz composição semântica por IA;
a proposta é fornecida pelo cliente e apenas validada pelo **motor Maestro**.
Não declarar GO ou execução autorizada por `valid=true`. A geração canônica
`project.compose`, sandbox de providers, controles de custo e persistência
após aprovação seguem em [#47](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/47).
Execução durável e Goal Loop continuam em [#48](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/48).

## Memória semântica canônica — leitura com isolamento (Bridge v1)

`initialize.capabilities.memory = {version:1, read:true, write:false, scoped:true}`.
As operações read-only `memory.search`, `memory.get` e `memory.timeline`
reutilizam a mesma `Memory` canônica e a identidade Git derivada pelo próprio
Maestro. O Nexus e demais clientes não leem o storage nem reconstroem escopo
localmente.

- `memory.search`: `{search?,type?,verified?,rank?,taskId?,offset?,limit?,projectPath?}`.
- `memory.get`: `{id,taskId?,projectPath?}` — resultado visível ou `null`.
- `memory.timeline`: mesma seleção, sem detalhes confidenciais.

Limites de `limit` 1–50 e `offset` 0–10000; taskId precisa ser seguro.
`projectPath` tem de coincidir com o root do processo Bridge. Os campos
`repositoryId`, `branch`, `workspaceId`, `headCommit`, `scope`,
`allowAncestry` e `baseDir` são derivados exclusivamente pelo Maestro e
não são aceitos do cliente.

As respostas são redigidas, registros com `<private>` ficam invisíveis,
`verified` só é true quando houver evidência real conforme política canônica.
A operação não migra observações da `IntelligenceMemory` do Nexus e não ativa
nenhuma escrita. A mudança de writer exige backup, readback, CAS/journal,
migração reversível e consentimento por operação, antes de retirar legado.
Ver Maestro [#41](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/41)
e Nexus [#113](https://github.com/IAPro-Community/nexus/issues/113).

## Memory.record — escrita opt-in, não ativada por padrão

O Bridge v1 pode anunciar `initialize.capabilities.memory.write=true` apenas quando iniciado pelo operador com `ORQUESTRADOR_MAESTRO_BRIDGE_MEMORY_WRITE=1` (ou opção explícita de processo). Mesmo assim, `memory.record` exige `confirmed:true`, justificativa, `idempotencyKey`, tipo, resumo e escopo derivado do Maestro. Os dados usam exclusivamente a `Memory` canônica. `verified` é forçado para false: um modelo não pode se autoverificar.

Não habilitar automaticamente no Nexus. A confirmação de UI não é autenticação, e qualquer cliente com acesso ao processo Bridge habilitado poderia enviar `confirmed:true`. O controle de autorização no Nexus e a migração reversível permanecem gates independentes. Veja [BRIDGE_MEMORY_WRITE.md](BRIDGE_MEMORY_WRITE.md) e [Maestro #41](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/41).

## Project.compose — geração semântica sob autoridade Maestro (opt-in)

`initialize.capabilities.projectCompose=true` anuncia a operação
`project.compose` quando a instância do Bridge possui um runtime com
registro de providers. O modo inicial suporta **somente Codex**, escolhido
explicitamente pelo cliente. Ele exige `approvedModelUse=true` e um
`artifact` de Composer com `approved=true`, id, version, content e SHA-256
conferidos *antes* de chamar o provider. A confirmação é uma asserção do
cliente local, **não autenticação de usuário**: integrações remotas precisam
de controles próprios de autenticação e de autorização humana.

```json
{
  "jsonrpc":"2.0",
  "id":3,
  "method":"project.compose",
  "params":{
    "projectPath":"/projeto",
    "approvedModelUse":true,
    "providerId":"codex",
    "model":"default",
    "artifact":{
      "id":"composer-123",
      "version":1,
      "approved":true,
      "content":"Implementar endpoint com testes...",
      "sha256":"<digest hexadecimal SHA-256 do content>"
    }
  }
}
```

O Maestro usa **seu próprio** `SemanticPlanner.plan` com
`allowFallback=false`, uma tentativa e `CodexAdapter` com
`sandbox="read-only"`. Gera atividades concretas, normaliza e revalida com
`plans.validate`, retornando um preview marcado como
`reviewOnly=true`, `executable=false`, `requiresApproval=true`,
`source="maestro-semantic-planner"`, digest do artefato, versão/digest
do contexto Maestro e `planningTelemetry` disponível. O conteúdo e os
eventos do provider não são persistidos em segundo storage do Nexus.

**Não confundir com execução sem efeitos:** o processo do provider é externo
e pode consumir tokens, recursos e serviço remoto. O sandbox read-only impede
alterações de arquivos quando realmente suportado pela versão instalada,
mas não é garantia de operação gratuita, offline ou sem chamadas de rede.
O cliente precisa sinalizar isso ao usuário e obter consentimento antes de
usar o modelo. Sem Codex, sem suporte a sandbox ou com saída inválida,
a chamada falha, sem fallback para outro provider ou pacote genérico.

`project.compose` **não** registra mission, executa Run, grava memória ou
autoriza dispatch. A autoridade e a revisão ficam no Maestro; a UI do
Nexus pode mostrar o preview e solicitar aprovação. Para execução durável
e recuperação, ver [#48](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/48).
Para suporte a outros providers e políticas de custo verificáveis, ver
[#47](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/47).

## Plans.routePreview — roteamento multiagente sem executar

O método Bridge `plans.routePreview` apresenta um **preflight não executável** de seleção de providers **por tarefa** para um plano validado pelo próprio Maestro. Negociar `initialize.capabilities.plansRoutePreview`; esta capability é verdadeira somente quando o Bridge recebe um registry de providers.

A requisição contém `artifact` (id, version, SHA256 e content), `proposal` (TaskGraphProposal validável por `plans.validate`) e uma lista `assignments` com **um item por task**: `taskId`, `providerId`, `model` opcional, `sandbox` e `worktreePath`. Example: frontend usa `agy` com `sandbox=enabled`; backend usa `opencode` com `sandbox=none`, cada um em worktree Git diferente do mesmo repositório.

O Maestro confere: DAG, integridade do artifact, IDs, modelo, instalação/capabilities do adapter, escopo do Git common directory, worktree id/branch/HEAD e conflitos entre tarefas independentes no mesmo workspace. Para AGY é aceito `enabled` no preflight; o adapter OpenCode **não** afirma suportar sandbox read-only e falha caso o cliente o exija. Em todos os casos, o executor precisa revalidar esses requisitos na admissão e antes do dispatch.

A resposta contém `ready`, `previewOnly=true`, `executable=false`, `approvalRequired=true`, o plano já verificado, atribuições selecionadas com estado `READY_FOR_REVIEW` ou `BLOCKED` e `blockers` específicos (ausência de provider, sandbox incompatível, worktree compartilhado). **Nenhum provider é substituído automaticamente**: AGY ausente não vira Codex; OpenCode indisponível não vira Claude. A ausência de provider bloqueia sua tarefa mas não apaga a seleção das outras.

Isso **não é um scheduler, um GO ou uma autorização real para alterar arquivos**. O método não chama `execute` de adapters, não salva missões ou runs, não fornece leases/reconnect. A execução em paralelo durável permanece dependente de [#48](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/48) e [#53](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/53).

## Run observation — polling de eventos sanitizados (não é subscribe)

O Bridge v1 oferece `runs.observe` quando a instância tem `runtime.inspectRun`. A negociação anuncia `initialize.capabilities.runsObserve=true`.

Requisição: `{ "runId":"run-123", "afterEventId":"ev-123"?, "limit":50? }`, limite 1–100. Retorna estado do Run, providerId original, taskId, lista ordenada de **eventos duráveis de lifecycle apenas** (`id`, `type`, `occurredAt`), `nextCursor`, `hasMore`, `executionOwner:"MAESTRO"`, `liveOutputAvailable:false` e `replayKind:"sanitized-lifecycle-only"`. Não retorna artefatos arbitrários, traces, logs, eventos `provider.output` nem variáveis de ambiente.

O Bridge valida que o Run e o Task pertencem ao Project com `realpath` igual ao root do processo. Runs inexistentes ou de outro projeto retornam `null`. Um cursor expirado ou inexistente falha fechado; o cliente deve recarregar o snapshot. O resultado não promete paginação entre snapshots atômicos nem que todos os eventos anteriores sejam reconstituíveis. O runtime mantém saída bruta **somente efêmera**, por privacidade.

**Limites importantes:** `runs.observe` é apenas uma projeção de leitura. Não cria/reativa jobs, não dá ACK assíncrono, não administra leases, não corrige estados órfãos e não equivale a `runs.subscribe`. Um produto pronto ainda exige daemon/worker supervisor, fencing, idempotência, cursor/epoch e restart/reconnect validados em [#48](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/48). Enquanto esses gates faltarem, o Nexus deve tratar a API como consulta diagnóstica e nunca como prova de execução durável.

### Compatibilidade de subscriptions (fail-closed)

O Bridge stdio v1 **não** implementa push de eventos duráveis. Portanto `initialize.capabilities.subscriptions=false` e `events.subscribe` devolve erro `-32601`, em vez de reconhecer uma subscription fictícia. Clientes legados que interpretavam `subscribed:true` como fluxo ativo precisam usar `runs.observe` para polling de lifecycle, sem raw output, ou aguardar a API de worker/event stream real de #48. Isso é uma correção de contrato, não uma implementação de subscribe.

## Run submissions — cancelamento de admissão (sem habilitar dispatch)

O Bridge v1 pode anunciar `initialize.capabilities.runsSubmissionsRead=true`
quando o RunStore canônico disponibiliza `listRunSubmissions`. O método
`runs.submissions.get` recebe `{ "submissionId": "submission-..." }`
e projeta apenas metadados operacionais sanitizados. A identidade do projeto
vem exclusivamente do root físico vinculado ao processo Bridge: IDs pertencentes
a outros projetos retornam `null`, sem revelar existência.

A capability aditiva `initialize.capabilities.runsSubmissionsCancel=true`
depende de `requestRunSubmissionCancellation` no RunStore. O método
`runs.submissions.cancel` recebe exclusivamente `submissionId`; não aceita
`projectId`, caminhos, tokens, requests de approval nem provider substituto.

- `PENDING_WORKER` transita de forma atômica para `CANCELLED`: não houve
  dispatch e o workspace pode ser liberado pela política do RunStore.
- `CLAIMED` ou `DISPATCHED` passam a `CANCEL_REQUESTED`: isso solicita
  interrupção ao worker, **não** afirma cancelamento efetivo. Os efeitos
  externos podem já ter ocorrido, e a confirmação exige Run/receipt real.
- Repetições retornam a mesma identidade e estado do registro atual; nenhuma
  operação cancela submissões de outro projeto, mesmo com ID conhecido.
- O método não cria um Run, não fornece heartbeat/daemon, não subscreve eventos
  e não autoriza execução. `runsSubmit` **permanece false** até a implementação
  completa do supervisor persistente da issue #48.

Para dois clientes locais apontando para o mesmo RunStore, as mudanças são
persistidas pelo lock canônico multiprocesso; sem um worker real, esse contrato
oferece cancelamento da admissão e sinalização segura, não abort remoto do
processo de um provider.
