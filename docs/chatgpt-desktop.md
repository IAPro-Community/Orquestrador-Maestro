# ChatGPT desktop (modo Codex) e o Maestro

O Maestro **não instala o aplicativo desktop**. Ele prepara o diretório Codex que
esse aplicativo lê. Esta página explica o que já funciona, o que o Maestro não
faz (e por quê) e a armadilha que faz as skills sumirem sem erro.

## O que é verdade hoje

Desde 2026-07-09 o ChatGPT desktop unificou Chat, Work e **Codex** num único app
(`ChatGPT.app` / `ChatGPT.exe`). O modo Codex é o mesmo agente do Codex CLI e lê o
**mesmo Codex home**:

| Cliente | Onde lê |
|---|---|
| Codex CLI | `$CODEX_HOME/skills` (padrão `~/.codex/skills`) |
| Extensão IDE (VS Code/Cursor) | o mesmo diretório |
| ChatGPT desktop — modo Codex | o mesmo diretório |

## O Maestro já instala o conteúdo, sem instalar o app

Ao rodar `orquestrador-maestro install --only codex`, o Maestro escreve em
`~/.codex/`:

- `skills/` — skills canônicas e workflows
- `agents/` — agentes nativos
- `prompts/` — prompts dos agentes
- `AGENTS.md` — contrato global

Esse é exatamente o diretório que o app desktop lê. **O conteúdo já é
instalado corretamente** e o app enxerga — desde que o `CODEX_HOME` não diverja.

O Maestro não instala o app porque ele é um aplicativo de terceiros, fechado e
distribuído por loja oficial. Instalar binários externos automaticamente violaria
a regra de não instalar dependências sem autorização. O Maestro **detecta e
informa**; a instalação é sua.

## Como instalar o app (comando oficial)

| Plataforma | Comando |
|---|---|
| macOS / Windows | `codex app` (abre o app ou o instalador) ou baixe em <https://chatgpt.com/download> |
| Windows (winget) | `winget install --id=9PLM9XGG6VKS -s msstore` |
| Linux Ubuntu/Debian | `sudo apt install ./chatgpt_amd64.deb` (arm64: `chatgpt_arm64.deb`) |
| Linux Fedora | `sudo dnf install ./chatgpt.x86_64.rpm` (arm64: `chatgpt.aarch64.rpm`) |
| Linux Arch | `curl -fsSL -o install-arch.sh https://persistent.oaistatic.com/codex-app-prod/linux/install-arch.sh && sudo bash install-arch.sh` |

Requisitos:

- **macOS**: 14+ (Apple Silicon ou Intel).
- **Windows**: 10 build 17763.0+.
- **Linux** (public preview desde 2026-08-11): Ubuntu 24.04 LTS / 26.04 LTS,
  Debian 13, Fedora 43 / 44, Arch current. x64 e ARM64.

Diagnóstico: `orquestrador-maestro doctor` retorna `CodexHome.platformSupport`.

> **Limitação do Linux**: no app Linux as ações de navegador funcionam no browser
> embutido ou no Chrome; controlar outros apps de desktop ainda não é suportado.

Atualização no Linux usa o gerenciador do sistema (`apt install --only-upgrade chatgpt`).

## A armadilha: `CODEX_HOME` divergente

Este é o motivo mais comum de "instalei o Maestro e o app não vê nenhuma skill".

O CLI e o app leem `$CODEX_HOME`. Se essa variável estiver definida no seu
shell (e não no app), o app lê um diretório **diferente** do `~/.codex` onde o
Maestro escreveu — e nada dá erro: as skills existem, mas não aparecem.

```
~/.codex/skills     <- Maestro escreve aqui
$CODEX_HOME/skills   <- CLI e app leem aqui  (divergente = invisível)
```

**Diagnóstico:**

```bash
orquestrador-maestro doctor      # campo CodexHome.divergent
orquestrador-maestro verify      # falha se CODEX_HOME divergir
```

**Correção:** defina `CODEX_HOME` igual para todos os clientes, ou não defina
em lugar nenhum (o padrão `~/.codex` passa a valer para todos).

```bash
#opção A: unset em todo lugar (usa ~/.codex)
unset CODEX_HOME

#opção B: defina igual para CLI e app
export CODEX_HOME="$HOME/.codex"
```

## O que o Maestro deliberadamente não faz

| Ação | Motivo |
|---|---|
| Instalar o app desktop | Binário fechado de terceiros; exige autorização explícita |
| Verificar/definir `CODEX_HOME` por você | Alterar env é decisão do operador; só detectamos e reportamos |
| Instalar Git, Node, Python, .NET | Dependências do app; só indicamos o comando oficial |

## Resumo

- ✅ As skills, agentes e prompts que o app desktop precisa **já são instalados**.
- ❌ O app em si **não** é instalado pelo Maestro (app fechado de terceiros).
- ⚠️ Se `CODEX_HOME` divergir, o app não vê nada **sem erro algum** — `doctor` e `verify` já detectam isso.