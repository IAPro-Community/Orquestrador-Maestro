# Maestro Cockpit por projeto

O runtime local é o proprietário dos PTYs. Cada sessão usa `node-pty`; `@xterm/headless` interpreta ANSI e mantém um scrollback limitado exclusivamente em memória. O store JSON recebe somente metadados da sessão e eventos compactos.

As novas sessões são `backend: "pty"`. Registros tmux antigos continuam listáveis como legado e podem ser abertos externamente; tmux não é o backend primário da grade.

O bridge expõe `projects.dashboard`, `agentSessions.*`, `panes.*` e o contrato legado `terminals.*`. Até seis painéis são exibidos por página; a posição do painel é metadado e a tela é reconstruída por snapshots em memória. O socket local usa um token privado com permissões de usuário para impedir conexões não autenticadas.

Quando `node-pty` não tem binário nativo, a criação retorna `PTY_UNAVAILABLE`, sem fallback silencioso para um processo sem TTY. Execute `npm rebuild node-pty` após instalar as ferramentas de compilação da plataforma.
