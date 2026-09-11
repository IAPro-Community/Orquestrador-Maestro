# Guia de instalação

Instale o Maestro no seu usuário e passe a usar o mesmo processo em ferramentas de IA compatíveis. A instalação não inclui modelos, logins ou credenciais: ela prepara regras, skills e pontos de entrada.

## Caminho mais curto

Com Node.js 18 ou superior:

```bash
npm install -g @iapro/orquestrador-maestro-cli@latest
orquestrador-maestro install
orquestrador-maestro verify
```

Precisa de Windows, Linux/macOS, clone, bootstrap, dry-run ou rollback? Continue neste guia. Depois de instalar, use o [guia operacional para IAs](ai-agent-operating-guide.md).

## Pré-Requisitos

- Windows com PowerShell ou Linux/macOS com Bash.
- Git instalado para clonar o repositório.
- Codex, Claude, Gemini, Grok CLI, MiMo Code, Kimi Code, Cursor, OpenCode, Windsurf ou Antigravity são opcionais. O instalador prepara as pastas e os arquivos; cada ferramenta continua responsável pelo próprio login, runtime e credenciais.

## Instalação Completa Recomendada

Para ver o plano antes de alterar qualquer arquivo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -DryRun
```

Linux/macOS:

```bash
bash install.sh --dry-run
```

### Windows

```powershell
git clone https://github.com/IAPro-Community/Orquestrador-Maestro.git
cd Orquestrador-Maestro
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

### Linux/macOS

```bash
git clone https://github.com/IAPro-Community/Orquestrador-Maestro.git
cd Orquestrador-Maestro
bash install.sh
```

O instalador usa o home do usuário que executa o comando:

```text
Windows: %USERPROFILE%
Linux/macOS: $HOME
```

Em uma máquina de exemplo, se o usuário for `maria`, os destinos ficam abaixo do home dela. Se o usuário for `joao`, ficam abaixo do home dele.

## Pastas Instaladas

| Destino | Função |
|---|---|
| `%USERPROFILE%\.orquestrador` | Núcleo do Orquestrador: regras, maestro, hooks, roteadores, scripts, skills canônicas e bibliotecas offload |
| `%USERPROFILE%\AGENTS.md` | Contrato global lido pelas IAs antes de trabalhar em projetos |
| `%USERPROFILE%\.codex\skills` | Conjunto nativo enxuto do Codex: skills canônicas, workflows OMX essenciais e `.system` |
| `%USERPROFILE%\.codex\agents` | Agentes nativos do Codex |
| `%USERPROFILE%\.codex\prompts` | Prompts dos agentes do Codex |
| `%USERPROFILE%\.agents\skills` | Espelho compatível mínimo com skills canônicas |
| `%USERPROFILE%\.claude\skills` | Raiz nativa mínima para Claude/Claude Code |
| `%USERPROFILE%\.opencode\skills` | Raiz nativa mínima para OpenCode |
| `%USERPROFILE%\.cursor\skills` | Raiz nativa mínima para Cursor |
| `%USERPROFILE%\.gemini\skills` | Raiz nativa mínima para Gemini |
| `%USERPROFILE%\.windsurf\skills` | Raiz nativa mínima para Windsurf |
| `%USERPROFILE%\.antigravity-skills\skills` | Raiz nativa mínima para compatibilidade adicional |
| `%USERPROFILE%\.orquestrador\skill-library\community-skills` | Biblioteca comunitária completa fora das raízes nativas |
| `%USERPROFILE%\.orquestrador\skill-library\codex-skills` | Catálogo completo de skills OMX/Codex fora da raiz nativa |
| `%USERPROFILE%\.orquestrador\skill-library\disabled-native` | Skills offloadadas das raízes nativas durante otimizações |
| `%USERPROFILE%\.ai-standards` | Standards portáteis usados pelo Antigravity |
| `%USERPROFILE%\.opencode` | Hooks e perfil textual do OpenCode |
| `%USERPROFILE%\.claude` | Hooks e prompt textual do Claude |
| `%USERPROFILE%\.cursor` | Hooks do Cursor |
| `%USERPROFILE%\.gemini` | Hooks do Gemini |
| `%USERPROFILE%\.windsurf` | Hooks do Windsurf |
| `%USERPROFILE%\.config\opencode` | `AGENTS.md` e `opencode.json` globais para OpenCode |
| `%USERPROFILE%\.claude\CLAUDE.md` | Memória global do Claude Code apontando para o Orquestrador |
| `%USERPROFILE%\.cursor\rules\orquestrador-maestro.mdc` | Regra local do Cursor para ativar o Orquestrador |
| `%USERPROFILE%\.cursor\commands\maestro.md` | Comando `/maestro` para reidratar o contexto ativo |
| `%USERPROFILE%\.gemini\GEMINI.md` | Contexto global do Gemini CLI |
| `%USERPROFILE%\.codeium\windsurf\memories\global_rules.md` | Regras globais do Windsurf/Cascade |
| `%USERPROFILE%\antigravity-rules.json` | Regras globais do Antigravity apontando para Orquestrador e AI standards |
| `%USERPROFILE%\.antigravity\antigravity.json` | Configuração de integração Antigravity + Orquestrador |
| `%USERPROFILE%\.antigravity\settings.json` | Configuração portável do Antigravity |

No Linux/macOS, os destinos equivalentes usam `$HOME` e `/`, por exemplo `$HOME/.orquestrador`, `$HOME/AGENTS.md`, `$HOME/.codex/skills`, `$HOME/.config/opencode` e `$HOME/.ai-standards`.

O ponto central dessa arquitetura é economia de contexto: as bibliotecas grandes continuam instaladas, mas fora das pastas que Claude Code, Codex, OpenCode, Cursor, Gemini, Windsurf e outros clientes tendem a enumerar automaticamente em toda sessão.

## Backups

O instalador principal usa backup automático. Quando encontra arquivos ou pastas existentes, ele salva cópias em:

```text
Windows: %USERPROFILE%\.orquestrador-public-backups\YYYYMMDD-HHMMSS
Linux/macOS: $HOME/.orquestrador-public-backups/YYYYMMDD-HHMMSS
```

Depois aplica a instalação completa.

## Verificação

Rode:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-install.ps1
```

No Linux/macOS:

```bash
bash scripts/verify-install.sh
```

Resultado esperado:

```text
Install verification passed.
```

O comando também mostra contagens de skills, agentes e prompts instalados.

## Instalações Alternativas

Todas as flags estão detalhadas em [installer-options.md](installer-options.md).

Só núcleo Orquestrador:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -CoreOnly
```

Linux/macOS:

```bash
bash install.sh --core-only
```

Completo sem hooks/perfis de ferramentas:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -NoToolProfiles
```

Linux/macOS:

```bash
bash install.sh --no-tool-profiles
```

Completo sem forçar substituição de `.orquestrador` e `AGENTS.md` existentes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -NoForce
```

Linux/macOS:

```bash
bash install.sh --no-force
```

Teste em home temporário:

```powershell
$tempHome = Join-Path $env:TEMP "orquestrador-test-home"
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -HomePath $tempHome
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-install.ps1 -HomePath $tempHome
```

Linux/macOS:

```bash
bash install.sh --home-path /tmp/orquestrador-test-home
bash scripts/verify-install.sh --home-path /tmp/orquestrador-test-home
```

## Depois De Instalar

Abra uma IA ou ferramenta compatível em qualquer projeto e peça:

```text
Leia o AGENTS.md do meu usuário, depois leia o AGENTS.md deste projeto se existir, e a pasta DEV deste projeto se existir.
Use o Orquestrador Maestro, escolha a skill correta e resolva a tarefa com verificação.
```

Quando o projeto tiver `DEV/`, essa pasta é tratada como documentação operacional local. A IA deve começar pelos arquivos curtos de controle: `DEV/README.md` ou `DEV/INDEX.md`, depois `DEV/HANDOFF.md`, `DEV/CONTEXT.md` e `DEV/SPECS/ACTIVE.md`. Só depois ela deve abrir os documentos específicos da tarefa.

Essa recuperação é regida pelo contrato compartilhado em `%USERPROFILE%\.orquestrador\PERSISTENCE.md` (ou `$HOME/.orquestrador/PERSISTENCE.md`). O histórico da conversa e memórias específicas de uma ferramenta são apenas auxiliares: ao encerrar uma sessão, trocar de software ou entregar o trabalho, a IA deve registrar o estado em `DEV/WORKLOG.md`, `DEV/VERIFY.md` e `DEV/HANDOFF.md`.

Para criar a estrutura `DEV/` em um projeto:

```bash
orquestrador-maestro init-dev --project-path /caminho/do/projeto
```

Ou pelo script local:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\init-project-dev.ps1 -ProjectPath "C:\caminho\do\projeto"
```

No Linux/macOS:

```bash
bash scripts/init-project-dev.sh --project-path /caminho/do/projeto
```

Depois de instalado, o mesmo helper também fica disponível no usuário:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.orquestrador\bin\init-project-dev.ps1" -ProjectPath "C:\caminho\do\projeto"
```

No Linux/macOS:

```bash
bash "$HOME/.orquestrador/bin/init-project-dev.sh" --project-path /caminho/do/projeto
```

O script cria `DEV/README.md`, `DEV/INDEX.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, `DEV/SPECS/ACTIVE.md`, `DEV/WORKLOG.md`, `DEV/VERIFY.md` e subpastas como `ADR/`, `API/`, `DATABASE/`, `RUNBOOKS/`, `TASKS/`, `RESEARCH/`, `HANDOFFS/`, `LOGS/`, `SQL/`, `ARCH/`, `WORKFLOWS/`, `TESTS/`, `DOCUMENTATION/` e `BACKLOG/`, sem sobrescrever arquivos existentes.

Para manter o contexto enxuto ao longo do projeto:

```bash
orquestrador-maestro check-dev-gates --project-path /caminho/do/projeto --max-entries 12 --strict
orquestrador-maestro compact-worklog --project-path /caminho/do/projeto --keep 12
```

O instalador também grava pontos globais de entrada para ferramentas que suportam arquivos de regra ou memória:

- Codex: `%USERPROFILE%\AGENTS.md` e `%USERPROFILE%\.codex\AGENTS.md`.
- OpenCode: `%USERPROFILE%\.config\opencode\AGENTS.md` e `%USERPROFILE%\.config\opencode\opencode.json`.
- Claude Code: `%USERPROFILE%\.claude\CLAUDE.md`.
- Gemini CLI: `%USERPROFILE%\.gemini\GEMINI.md`.
- Cursor: `%USERPROFILE%\.cursor\rules\orquestrador-maestro.mdc`, `%USERPROFILE%\.cursor\AGENTS.md` e `%USERPROFILE%\.cursor\commands\maestro.md` (`/maestro`).
- Windsurf/Cascade: `%USERPROFILE%\.codeium\windsurf\memories\global_rules.md`.
- Antigravity: `%USERPROFILE%\antigravity-rules.json`, `%USERPROFILE%\.antigravity\antigravity.json`, `%USERPROFILE%\.antigravity\settings.json` e `%USERPROFILE%\.ai-standards`.

No Linux/macOS, esses pontos usam `$HOME`, como `$HOME/AGENTS.md`, `$HOME/.config/opencode/opencode.json`, `$HOME/.claude/CLAUDE.md`, `$HOME/.cursor/AGENTS.md`, `$HOME/.gemini/GEMINI.md`, `$HOME/.codeium/windsurf/memories/global_rules.md` e `$HOME/.ai-standards`.

Se uma versão da ferramenta usar regras globais em nuvem ou apenas pela interface, copie o conteúdo de `%USERPROFILE%\AGENTS.md` no Windows ou `$HOME/AGENTS.md` no Linux/macOS para a regra global do usuário nessa interface.

## Troubleshooting

Se o PowerShell bloquear execução de script, use sempre:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

Se a instalação parecer incompleta, rode:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-install.ps1
```

No Linux/macOS:

```bash
bash scripts/verify-install.sh
```

Se quiser voltar uma instalação anterior, procure o backup mais recente em:

```text
Windows: %USERPROFILE%\.orquestrador-public-backups
Linux/macOS: $HOME/.orquestrador-public-backups
```

Este repo não instala credenciais, tokens, logins ou chaves de API. Configure esses itens diretamente em cada ferramenta.
