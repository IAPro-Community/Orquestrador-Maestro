# Tool Profiles

Tool profiles let each supported client find the same Maestro contract without taking over its login, model, or runtime. For installation, start with the [installation guide](installation.md).

## Grok CLI

The Grok CLI reads the Orquestrador through the same portable `AGENTS.md` and skill roots used by the other agents. Configure a user installation with:

- Windows PowerShell: `scripts/install-grok-orquestrador.ps1`
- Linux/macOS: `scripts/install-grok-orquestrador.sh`

The installer writes `~/.grok/config.toml` and points Grok at `~/.orquestrador/skills` and `~/.agents/skills`. Verify discovery with `grok inspect`.

## Freebuff

Freebuff usa `AGENTS.md`, `knowledge.md` e `.agents/skills` como contrato de contexto. O Maestro registra o componente `freebuff` e deixa a skill compartilhada disponível sem instalar, alterar ou copiar autenticação, sessões, cache, logs ou histórico.

Use `orquestrador-maestro install --only freebuff --force` e, depois de uma atualização do catálogo, `sync-skills.ps1 -Apply -Only freebuff` ou o equivalente Bash. A execução continua no CLI/desktop interativo do Freebuff; o runtime do Maestro ainda não anuncia um provider headless para ele.

## MiMo Code e Kimi Code

O instalador também prepara os pontos de entrada globais de MiMo Code e Kimi Code:

- MiMo Code: `~/.mimo/AGENTS.md`, executável `mimo`.
- Kimi Code: `~/.kimi-code/AGENTS.md` e `config.toml`, executável `kimi`.
- Grok Build: `~/.grok/config.toml`, executável `grok`.

Use `--only mimo,kimi,grok` para instalar somente esses perfis. O instalador não instala os CLIs nem gerencia login, credenciais, sessões ou caches. MiMo Code e Kimi Code usam as skills compartilhadas em `~/.agents/skills`; Kimi também recebe diretórios extras apontando para o snapshot do Orquestrador.

`tool-profiles/` guarda hooks e perfis textuais selecionados para reaproveitar o comportamento do Orquestrador em outras ferramentas sem publicar o diretório completo de cada uma.

## Catálogo de adaptadores

O catálogo declarativo de agentes e providers está em [`orquestrador/TOOL_ADAPTERS.json`](../orquestrador/TOOL_ADAPTERS.json). Ele separa superfícies de execução, destinos globais/projeto, capacidades e estado que nunca deve ser gerenciado pelo snapshot público.

Consulte o catálogo sem alterar arquivos:

```text
orquestrador-maestro adapters list
orquestrador-maestro adapters paths junie
orquestrador-maestro adapters validate
```

Os adaptadores nunca devem copiar autenticação, sessões, caches, logs, bancos locais, histórico de conversas ou secrets. Para ferramentas que aceitam `AGENTS.md` e `.agents/skills`, esse contrato compartilhado continua sendo a primeira opção; formatos proprietários devem ser renderizados somente quando agregarem MCP, hooks, agents, permissões ou outra capacidade específica.

Os hooks e entrypoints estão detalhados em [orquestrador-reference.md](orquestrador-reference.md). Este arquivo explica principalmente quais perfis são empacotados e onde o instalador os coloca.

## Incluído

- `tool-profiles/codex/`: `AGENTS.md` do Codex.
- `tool-profiles/opencode/`: hooks, sistema, regras, maestro e índice de skills.
- `tool-profiles/opencode-global/`: `AGENTS.md` e `opencode.json` globais para `~/.config/opencode`.
- `tool-profiles/claude/`: hooks e prompt de sistema.
- `tool-profiles/cursor/`: hooks.
- `tool-profiles/gemini/`: hooks.
- `tool-profiles/windsurf/`: hooks.
- `tool-profiles/windsurf-global/`: `global_rules.md` para Windsurf/Cascade.
- `tool-profiles/antigravity-home/`: `antigravity-rules.json` instalado no home do usuário.
- `tool-profiles/antigravity/`: `antigravity.json` e `settings.json`.
- `tool-profiles/mimo/`: `AGENTS.md` global para MiMo Code.
- `tool-profiles/kimi/`: `AGENTS.md` e `config.toml` globais para Kimi Code.
- `tool-profiles/grok/`: `config.toml` global para Grok Build.
- `tool-profiles/freebuff/`: documentação do contrato compartilhado; o Freebuff usa diretamente `AGENTS.md` e `.agents/skills`.
- `tool-profiles/ai-standards/`: standards portáteis instalados em `~/.ai-standards`.
- `orquestrador/blueprints/project/`: bootstrap de workspace para VS Code, GitHub Copilot, Continue, JetBrains AI Assistant, Aider, Cline e Windsurf.

## Excluído

- OAuth, contas, auth, tokens e configurações MCP locais.
- Histórico de uso, sessões, tracking, browser profile e caches.
- Regras locais de `.codex\rules`, porque podem guardar allowlists e comandos específicos da máquina.
- Diretórios completos de IDE.
- Dados de projetos privados.

## Instalação

O instalador principal já inclui perfis de ferramenta:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

Linux/macOS:

```bash
bash install.sh
```

Para pular os perfis:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -NoToolProfiles
```

Linux/macOS:

```bash
bash install.sh --no-tool-profiles
```

No instalador avançado, perfis de ferramenta são opt-in:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -InstallToolProfiles
```

Linux/macOS:

```bash
bash scripts/install.sh --install-tool-profiles --force
```

Se usar o instalador avançado e a máquina já tiver `.orquestrador` ou `AGENTS.md`, use `-Force` para criar backup antes da substituição:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -InstallToolProfiles -Force
```

## Pontos De Entrada Instalados

O pacote instala arquivos nos locais que as ferramentas costumam ler como regra, memória ou configuração global:

| Ferramenta | Arquivo instalado |
|---|---|
| Codex | `%USERPROFILE%\AGENTS.md` e `%USERPROFILE%\.codex\AGENTS.md` |
| OpenCode | `%USERPROFILE%\.config\opencode\AGENTS.md` e `%USERPROFILE%\.config\opencode\opencode.json` |
| Claude Code | `%USERPROFILE%\.claude\CLAUDE.md` |
| Gemini CLI | `%USERPROFILE%\.gemini\GEMINI.md` |
| Cursor | `%USERPROFILE%\.cursor\rules\orquestrador-maestro.mdc`, `%USERPROFILE%\.cursor\AGENTS.md` e `%USERPROFILE%\.cursor\commands\maestro.md` |
| Windsurf/Cascade | `%USERPROFILE%\.codeium\windsurf\memories\global_rules.md` |
| Antigravity | `%USERPROFILE%\antigravity-rules.json`, `%USERPROFILE%\.antigravity\antigravity.json`, `%USERPROFILE%\.antigravity\settings.json` e `%USERPROFILE%\.ai-standards` |
| MiMo Code | `%USERPROFILE%\.mimo\AGENTS.md` |
| Kimi Code | `%USERPROFILE%\.kimi-code\AGENTS.md` e `%USERPROFILE%\.kimi-code\config.toml` |
| Grok Build | `%USERPROFILE%\.grok\config.toml` |
| Freebuff | `%USERPROFILE%\AGENTS.md` e `%USERPROFILE%\.agents\skills` |
| VS Code + GitHub Copilot | projeto aberto: `.github\copilot-instructions.md` e `.vscode\extensions.json` |
| Continue | projeto aberto: `.continue\rules\00-orquestrador-maestro.md` |
| JetBrains AI Assistant | projeto aberto: `.aiassistant\rules\orquestrador-maestro.md` |
| Aider | projeto aberto: `.aider.conf.yml` |
| Cline | projeto aberto: `.clinerules` |
| Windsurf (projeto) | projeto aberto: `.windsurfrules` |

Todos esses pontos de entrada mandam a ferramenta usar o `AGENTS.md` global, o Orquestrador e, quando existir no projeto aberto, a documentação `DEV/` antes das skills globais. Eles também orientam a manter documentação durável do projeto em `DEV/` e registrar trabalho substancial em `DEV/WORKLOG.md`.

Para VS Code e GitHub Copilot, o bootstrap de projeto cria `.github/copilot-instructions.md` e `.vscode/extensions.json`. Para Continue, JetBrains AI Assistant, Aider, Cline e Windsurf no nível do projeto, o bootstrap cria arquivos reconhecidos por cada ferramenta com o mesmo contrato compacto do Orquestrador. Isso cobre o uso mais comum do ecossistema AI-native dentro do editor ou CLI sem depender de um perfil global específico.

No Linux/macOS, os mesmos pontos ficam sob `$HOME`, como `$HOME/AGENTS.md`, `$HOME/.config/opencode/opencode.json`, `$HOME/.claude/CLAUDE.md`, `$HOME/.cursor/AGENTS.md`, `$HOME/.gemini/GEMINI.md`, `$HOME/.codeium/windsurf/memories/global_rules.md` e `$HOME/.ai-standards`.

Se uma ferramenta estiver em uma versão que só aceita regra global por UI ou conta em nuvem, copie o conteúdo de `%USERPROFILE%\AGENTS.md` no Windows ou `$HOME/AGENTS.md` no Linux/macOS para a regra global dessa ferramenta.

## Matriz De Capacidades

## Catalogo De Adaptadores

O catalogo estruturado fica em `orquestrador/TOOL_ADAPTERS.json`. Para inspecionar os destinos sem alterar arquivos:

```text
node bin/orquestrador-maestro.js adapters list
node bin/orquestrador-maestro.js adapters paths junie
node bin/orquestrador-maestro.js adapters render junie --project-path . --dry-run
```

O modo `render` e simulado por padrao; `--apply` precisa ser explicito. Nesta primeira fatia, Junie recebe configuracao segura e skill do projeto, enquanto Goose e OpenHands recebem a skill compartilhada. OpenHands tambem recebe um agente baseado em arquivo. Arquivos existentes sao preservados. Modelos, provedores, extensoes, MCP, credenciais, sessoes, cache, logs, historico e bancos continuam fora do escopo.

A fonte estruturada da matriz é `orquestrador/PROGRAM_ENTRYPOINTS.json`. A tabela abaixo resume o comportamento público esperado:

| Ferramenta | Componente `Only` | Autoativação | Hook/profile instalado | Reescrita de comando |
|---|---|---|---|---|
| Codex | `codex` | Sim | `AGENTS.md`, skills, agentes e prompts | Não |
| OpenCode | `opencode` | Sim | `AGENTS.md`, `opencode.json`, hooks e skills | Não |
| Claude Code | `claude` | Sim | `CLAUDE.md`, `SYSTEM_PROMPT.md`, hooks e skills | Não por padrão |
| Cursor | `cursor` | Sim | `AGENTS.md`, regra MDC, hooks, comando `/maestro` e skills | Não |
| Gemini CLI | `gemini` | Sim | `GEMINI.md`, hooks e skills | Não |
| Windsurf | `windsurf` | Sim | `global_rules.md`, hooks e skills | Não |
| Antigravity | `antigravity` | Sim | `antigravity-rules.json`, `.antigravity`, `.ai-standards` e skills | Não |
| MiMo Code | `mimo` | Sim | `AGENTS.md` e skills compartilhadas | Não |
| Kimi Code | `kimi` | Sim | `AGENTS.md`, `config.toml` e skills compartilhadas | Não |
| Grok Build | `grok` | Sim | `config.toml` e skills compartilhadas | Não |
| VS Code + Copilot | `workspace` | Sim, via bootstrap do projeto | `.github/copilot-instructions.md`, `.vscode/extensions.json` | Não |
| Continue | `workspace` | Sim, via bootstrap do projeto | `.continue/rules/00-orquestrador-maestro.md` | Não |
| JetBrains AI Assistant | `workspace` | Sim, via bootstrap do projeto | `.aiassistant/rules/orquestrador-maestro.md` | Não |
| Aider | `workspace` | Sim, via bootstrap do projeto | `.aider.conf.yml` | Não |
| Cline | `workspace` | Sim, via bootstrap do projeto | `.clinerules` | Não |
| Windsurf (projeto) | `workspace` | Sim, via bootstrap do projeto | `.windsurfrules` | Não |

A inspiração do RTK deve ser tratada como futuro wrapper opt-in para saídas compactas, não como hook automático instalado no fluxo padrão. Isso evita alterar comandos do usuário sem consentimento.
