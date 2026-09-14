# Orquestrador Maestro

> Para a experiência de entrada atual, use o [README](../README.md) e o [guia de instalação](installation.md). Este guia mantém detalhes de distribuição e operação.

Este guia explica o que é o Orquestrador Maestro, onde baixar, como instalar, como verificar a instalação e como usar a hierarquia de regras e documentação em projetos.

## Link De Download

Repositório oficial:

[https://github.com/IAPro-Community/Orquestrador-Maestro](https://github.com/IAPro-Community/Orquestrador-Maestro)

Clone por Git:

```bash
git clone https://github.com/IAPro-Community/Orquestrador-Maestro.git
```

Download em ZIP:

[Baixar ZIP da branch main](https://github.com/IAPro-Community/Orquestrador-Maestro/archive/refs/heads/main.zip)

## O Que É

O Orquestrador Maestro é um kit de configuração para preparar um usuário Windows, Linux ou macOS com regras, skills, hooks e perfis de IA. A ideia é que várias ferramentas de IA encontrem uma mesma hierarquia de instruções, skills e documentação de projeto.

Depois de instalado, ele cria uma estrutura no `%USERPROFILE%` do Windows ou no `$HOME` do Linux/macOS. Não usa o nome nem o caminho de outra pessoa; os templates são ajustados para o usuário que executa o instalador.

Para entender a lógica interna, consulte:

- [Referência técnica do Orquestrador](orquestrador-reference.md): roteamento, hooks, perfis, sync, verificação e lógica de execução.
- [Portal de skills](skills/README.md): descoberta por objetivo, receitas operacionais e referência gerada. O [catálogo compacto](skill-catalog.md) permanece por compatibilidade.

## O Que Ele Instala

Instalação completa cria ou atualiza:

| Destino | Função |
|---|---|
| `%USERPROFILE%\.orquestrador` | Núcleo com regras, maestro, roteadores, scripts, skills canônicas e bibliotecas offload |
| `%USERPROFILE%\AGENTS.md` | Contrato global para IAs que leem arquivos locais |
| `%USERPROFILE%\.codex\skills` | Conjunto nativo enxuto do Codex: skills canônicas, workflows OMX essenciais e `.system` |
| `%USERPROFILE%\.codex\agents` | Agentes nativos do Codex |
| `%USERPROFILE%\.codex\prompts` | Prompts dos agentes |
| `%USERPROFILE%\.agents\skills` | Espelho compatível mínimo de skills canônicas |
| `%USERPROFILE%\.claude\skills` | Raiz nativa mínima para Claude/Claude Code |
| `%USERPROFILE%\.opencode\skills` | Raiz nativa mínima para OpenCode |
| `%USERPROFILE%\.cursor\skills` | Raiz nativa mínima para Cursor |
| `%USERPROFILE%\.gemini\skills` | Raiz nativa mínima para Gemini |
| `%USERPROFILE%\.windsurf\skills` | Raiz nativa mínima para Windsurf |
| `%USERPROFILE%\.antigravity-skills\skills` | Raiz nativa mínima de compatibilidade |
| `%USERPROFILE%\.orquestrador\skill-library\community-skills` | Biblioteca comunitária completa fora das raízes nativas |
| `%USERPROFILE%\.orquestrador\skill-library\codex-skills` | Catálogo completo de skills OMX/Codex fora da raiz nativa |
| `%USERPROFILE%\.ai-standards` | Standards portáteis usados pelo Antigravity |

No Linux/macOS, os destinos equivalentes ficam sob `$HOME`, como `$HOME/.orquestrador`, `$HOME/AGENTS.md`, `$HOME/.codex/skills`, `$HOME/.config/opencode` e `$HOME/.ai-standards`.

As bibliotecas grandes continuam instaladas, mas fora das pastas que os clientes tendem a enumerar automaticamente. Isso é parte direta da estratégia de economia de tokens do Orquestrador.

Também instala pontos de entrada para ferramentas:

| Ferramenta | Entrada instalada |
|---|---|
| Codex | `%USERPROFILE%\AGENTS.md` e `%USERPROFILE%\.codex\AGENTS.md` |
| OpenCode | `%USERPROFILE%\.config\opencode\AGENTS.md` e `%USERPROFILE%\.config\opencode\opencode.json` |
| Claude Code | `%USERPROFILE%\.claude\CLAUDE.md` |
| Cursor | `%USERPROFILE%\.cursor\AGENTS.md` e `%USERPROFILE%\.cursor\rules\orquestrador-maestro.mdc` |
| Gemini CLI | `%USERPROFILE%\.gemini\GEMINI.md` |
| Windsurf/Cascade | `%USERPROFILE%\.codeium\windsurf\memories\global_rules.md` |
| Antigravity | `%USERPROFILE%\antigravity-rules.json`, `%USERPROFILE%\.antigravity\antigravity.json`, `%USERPROFILE%\.antigravity\settings.json` e `%USERPROFILE%\.ai-standards` |

## Pré-Requisitos

- Windows com PowerShell ou Linux/macOS com Bash.
- Git instalado, se for baixar por `git clone`.
- A ferramenta de IA que você pretende usar, como Codex, OpenCode, Claude Code, Cursor, Gemini CLI, Windsurf ou Antigravity.

Credenciais, tokens, logins e chaves de API não são instalados por este repositório. Configure esses itens diretamente em cada ferramenta.

## Instalação Recomendada

### Windows

Abra o PowerShell e rode:

```powershell
git clone https://github.com/IAPro-Community/Orquestrador-Maestro.git
cd Orquestrador-Maestro
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

### Linux/macOS

Abra o terminal e rode:

```bash
git clone https://github.com/IAPro-Community/Orquestrador-Maestro.git
cd Orquestrador-Maestro
bash install.sh
```

O instalador usa automaticamente o home do usuário atual:

```text
Windows: %USERPROFILE%
Linux/macOS: $HOME
```

Se já existir uma instalação anterior, o instalador cria backup em:

```text
Windows: %USERPROFILE%\.orquestrador-public-backups
Linux/macOS: $HOME/.orquestrador-public-backups
```

## Instalar A Partir Do ZIP

1. Baixe o ZIP pelo link:
   [Orquestrador-Maestro main.zip](https://github.com/IAPro-Community/Orquestrador-Maestro/archive/refs/heads/main.zip)
2. Extraia o ZIP em uma pasta local.
3. Abra o PowerShell dentro da pasta extraída.
4. Rode:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

No Linux/macOS, abra o terminal dentro da pasta extraída e rode:

```bash
bash install.sh
```

## Verificar Instalação

Depois de instalar, rode dentro do clone ou da pasta extraída:

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

Se aparecer esse resultado, os arquivos principais, skills e entrypoints foram instalados.

## Como Pedir Para A IA Usar

Em qualquer projeto, use um prompt como:

```text
Use o Orquestrador Maestro instalado no meu usuário.
Leia primeiro meu AGENTS.md global (%USERPROFILE%\AGENTS.md no Windows ou $HOME/AGENTS.md no Linux/macOS), depois o AGENTS.md deste projeto se existir, e a pasta DEV deste projeto se existir.
Consulte as skills globais antes de decidir a abordagem.
Resolva a tarefa diretamente, verifique antes de concluir e não faça commit/push sem eu pedir.
```

Para execução longa:

```text
Use $ralph. Siga até concluir [descrever objetivo], verificando no final.
```

Para planejamento:

```text
Use $ralplan. Quero um plano para [descrever objetivo], com riscos, tradeoffs e sequência de execução.
```

Para revisão:

```text
Use $code-review para revisar as mudanças recentes com foco em bugs, riscos e regressões.
```

## Hierarquia De Leitura

A ordem esperada é:

1. `%USERPROFILE%\.orquestrador\rules.md` ou `$HOME/.orquestrador/rules.md`
2. `%USERPROFILE%\.orquestrador\maestro.md` ou `$HOME/.orquestrador/maestro.md`
3. `%USERPROFILE%\AGENTS.md` ou `$HOME/AGENTS.md`
4. `AGENTS.md` do projeto, se existir
5. `DEV/` do projeto, se existir
6. Skill específica da tarefa

## Pasta DEV Dos Projetos

Todo projeto pode ter uma pasta `DEV/` para documentação operacional e memória compacta. Ela existe para economizar tokens nas próximas sessões.

Leitura recomendada:

1. `DEV/AGENTS.md`, se existir
2. `DEV/README.md` ou `DEV/INDEX.md`
3. `DEV/CONTEXT.md`
4. Arquivos específicos da tarefa

Depois de trabalho substancial, a IA deve atualizar:

- `DEV/WORKLOG.md`: resumo curto do que foi feito.
- `DEV/INDEX.md`: quando criar, mover ou remover documentação.
- `DEV/CONTEXT.md`: quando mudarem comandos, arquitetura, ambiente, riscos ou decisões vivas.

Para criar essa estrutura em um projeto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.orquestrador\bin\init-project-dev.ps1" -ProjectPath "C:\caminho\do\projeto"
```

No Linux/macOS:

```bash
bash "$HOME/.orquestrador/bin/init-project-dev.sh" /caminho/do/projeto
```

## Opções De Instalação

Instalar só o núcleo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -CoreOnly
```

Linux/macOS:

```bash
bash install.sh --core-only
```

Instalar sem perfis de ferramentas:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -NoToolProfiles
```

Linux/macOS:

```bash
bash install.sh --no-tool-profiles
```

Não forçar substituição do núcleo existente:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -NoForce
```

Linux/macOS:

```bash
bash install.sh --no-force
```

Instalar em um home temporário para teste:

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

## Atualizar Uma Instalação

Se instalou com Git:

```powershell
cd Orquestrador-Maestro
git pull
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-install.ps1
```

Linux/macOS:

```bash
cd Orquestrador-Maestro
git pull
bash install.sh
bash scripts/verify-install.sh
```

Se instalou por ZIP, baixe o ZIP novamente, extraia e rode `install.ps1` no Windows ou `install.sh` no Linux/macOS.

## Segurança E Privacidade

Este repositório público não deve incluir:

- tokens, senhas, chaves de API ou `.env`;
- logs, sessões, caches, memórias locais ou backups privados;
- histórico de navegador, OAuth ou perfis completos de IDE;
- caminhos reais da máquina fonte.

O instalador usa placeholders como `{{USER_HOME}}` e substitui pelo home do usuário que instala.

## Troubleshooting

Se o PowerShell bloquear execução:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

Se a IA não encontrar o Orquestrador:

1. Verifique se `%USERPROFILE%\.orquestrador` existe no Windows ou `$HOME/.orquestrador` no Linux/macOS.
2. Verifique se `%USERPROFILE%\AGENTS.md` existe no Windows ou `$HOME/AGENTS.md` no Linux/macOS.
3. Rode `scripts\verify-install.ps1` no Windows ou `scripts/verify-install.sh` no Linux/macOS.
4. Peça para a IA ler o `AGENTS.md` global do seu usuário.

Se uma ferramenta tiver regras globais apenas pela interface ou nuvem, copie o conteúdo de `%USERPROFILE%\AGENTS.md` no Windows ou `$HOME/AGENTS.md` no Linux/macOS para a regra global dessa ferramenta.

## Links Úteis

- [Instalação detalhada](installation.md)
- [Referência técnica do Orquestrador](orquestrador-reference.md)
- [Portal e referência de skills](skills/README.md)
- [Guia para IAs](ai-agent-operating-guide.md)
- [Hierarquia DEV](project-dev-hierarchy.md)
- [Perfis de ferramentas](tool-profiles.md)
- [Privacidade e sanitização](privacy-model.md)
