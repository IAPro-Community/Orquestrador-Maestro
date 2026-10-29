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

## Leitura de memória episódica pelo Bridge (incremento aditivo)

O Bridge v1 agora declara `initialize.result.capabilities.memory = { version: 1, read: true, write: false, scoped: true }`. Essas operações são **somente leitura** e consultam a mesma store do comando `orquestrador-maestro memory`; não existe segunda memória, indexação duplicada nem migração automática:

- `memory.search` — `{ search?, type?, verified?, rank?, taskId?, offset?, limit?, projectPath? }` retorna `{ schemaVersion: 1, authority: "maestro", items: [...], page: { offset, limit, hasMore } }`;
- `memory.get` — `{ id, taskId?, projectPath? }` retorna uma observação visível e sanitizada ou `null`;
- `memory.timeline` — os filtros de `memory.search` e uma projeção resumida de observações.

`limit` deve estar entre 1 e 50; `offset` entre 0 e 10000; `taskId` deve ser identificador simples. O contexto Git/repositório/branch/worktree/commit é sempre **calculado pelo Maestro** a partir do `--project-path` associado ao processo Bridge. É proibido sobrescrever `repositoryId`, `branch`, `workspaceId`, `scope`, `headCommit`, `allowAncestry` ou `baseDir` via RPC. Visibilidade por tarefa depende de `taskId` explícito. `memory.get` não usa `Memory.show` diretamente, pois ele não impõe isolamento por branch/worktree.

As respostas usam o mesmo redator de informações privadas da memória; conteúdo com blocos `<private>` em registros legados é excluído. Retornos de lista não incluem detalhes por padrão; `memory.get` limita detalhes a 4000 caracteres. Valores `verified:true` sem identificador/verificação temporal são tratados como não verificados.

Exemplo de requisição:

```json
{"jsonrpc":"2.0","id":2,"method":"memory.search","params":{"search":"arquitetura","limit":20,"taskId":"review-1"}}
```

**Não disponíveis neste incremento:** `memory.record`, `memory.promote`, `memory.forget`, escrita de notas, `retain/recall/reflect` como mutações RPC, streaming e compaction nativa do provider. A gravação será introduzida apenas após contrato de aprovação, migração e rollback entre Maestro e Nexus. Os clientes devem negociar capabilities e tratar métodos ausentes como `-32601` (não fazer fallback silencioso para dados semânticos do Nexus).
