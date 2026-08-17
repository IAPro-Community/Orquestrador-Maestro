# Maestro Project Manager

O Project Manager é uma camada opcional sobre o Runtime. Ele não altera `DEV/`, instalações, sincronização de Skills nem comandos legados.

Cada projeto é identificado de modo determinístico a partir de seu caminho absoluto e é criado somente quando um Run ou comando gerenciado é iniciado. Os comandos aditivos são:

```text
maestro projects
maestro project add /caminho/do/projeto
maestro project show <project-id>
maestro runs --project-path /caminho/do/projeto
maestro run inspect <run-id>
maestro tui --project-path /caminho/do/projeto
```

O estado do projeto é evidencial: `healthy` requer o último Run concluído e Git limpo; `changes_detected` relata alterações no Git; `verification_failed` vem de uma verificação real falha; `needs_attention` vem de um Run falho; `running` vem de um Run ativo; `idle` indica que ainda não há Run conhecido.

O TUI é intencionalmente leve e sem dependências. Ele é um cliente do `MaestroApplication`, não duplica execução, descoberta de Skills ou persistência.

## Sessões nativas de terminal

As sessões nativas são separadas de `Run` e usam os estados `created`, `running`, `exited`, `failed`, `closed` e `detached`. Elas persistem apenas metadados de operação: projeto, provider opcional, diretório, comando, argumentos, timestamps e estado de apresentação. Não persistem conteúdo de tela, prompts ou segredos.

```text
maestro terminals [--project-path /caminho/do/projeto]
maestro terminal agent codex [--project-path /caminho/do/projeto]
maestro terminal shell [--project-path /caminho/do/projeto] -- npm test
maestro terminal attach <id>
maestro terminal close <id>
```

O backend `tmux` é opcional e não é instalado pelo Maestro. Ele mantém sessões da TUI e permite reanexação ao CLI nativo escolhido. O backend `vscode` é usado somente pela extensão, que cria e renderiza o terminal com `vscode.window.createTerminal`; o Runtime preserva o lock e os metadados, mas não cria pseudo-terminal. Há vários shells por projeto, porém somente uma sessão de agente com potencial de escrita por workspace. Worktrees e escrita paralela são uma fase futura.

`orquestrador-maestro tui` abre o painel visual OpenTUI: cabeçalho do projeto, sessões, detalhes e barra de comando. Os atalhos incluem setas para selecionar, Enter para anexar, `n` para agente, `s` para shell, `x` para encerrar, `r` para atualizar e `p` para trocar projeto. `orquestrador-maestro tui --classic` existe apenas como compatibilidade explícita. `@opentui/core` é obtido por `npm install`/`bun install`; Bun continua um pré-requisito manual. O instalador do Maestro não baixa nem instala Bun ou tmux.

## Comando gerenciado legado

O primeiro contrato chama-se **comando gerenciado**, não emulador de terminal. Ele executa um binário explícito sem shell e registra PID, saída limitada, código de saída e projeto. Isso evita introduzir `node-pty`, daemon obrigatório ou uma falsa promessa de terminal persistente.

```text
maestro terminal start --project-path /caminho/do/projeto -- npm test
maestro terminal list --project-path /caminho/do/projeto
```

No CLI o comando aguarda a conclusão, pois o processo CLI termina ao final. No bridge/TUI/extensão, a sessão fica viva enquanto o processo `orquestrador-maestro bridge --stdio` estiver vivo. Se o cliente que hospedava uma sessão sair, outro cliente a mostra como `detached`; não há alegação de reconexão de PTY nesta etapa.
