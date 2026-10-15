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
