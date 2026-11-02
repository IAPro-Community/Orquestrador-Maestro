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
