# Maestro Project Manager

> Status: ativo na linha 1.0 Alpha. A superfície experimental `cli-novo`
> (TUI, PTY persistente, daemon/socket e cliente VS Code) foi removida desta
> release por não ter atingido o nível de fechamento exigido para a V1.

O Project Manager é uma camada opcional sobre o Runtime. Ele não altera `DEV/`,
instalações, sincronização de Skills nem o contrato dos providers.

Cada projeto é identificado de modo determinístico a partir de seu caminho
absoluto e é criado quando um Run ou comando gerenciado é iniciado.

```text
maestro projects
maestro project add /caminho/do/projeto
maestro project show <project-id>
maestro runs --project-path /caminho/do/projeto
maestro run inspect <run-id>
```

O estado do projeto continua evidencial: deriva de Runs, verificação e estado
real do repositório. A V1 não depende de uma interface visual para manter esse
estado.

## Terminal gerenciado

A linha 1.0 mantém somente o contrato simples de **comando gerenciado**. Ele
executa um binário explícito sem shell, registra metadados operacionais e
aguarda a conclusão quando iniciado pelo CLI.

```text
maestro terminal start --project-path /caminho/do/projeto -- npm test
maestro terminal list --project-path /caminho/do/projeto
maestro terminal stop <terminal-id> --project-path /caminho/do/projeto
```

Não fazem parte da release 1.0 Alpha:

- TUI/OpenTUI;
- `node-pty` ou sessões PTY persistentes;
- `terminal agent`, `terminal shell`, `terminal attach` e `terminal close`;
- daemon/socket local e protocolo visual v2;
- panes/cockpit;
- extensão VS Code dependente dessa arquitetura.

Essas ideias podem ser retomadas futuramente como uma feature isolada e
versionada, sem contaminar o contrato da V1.
