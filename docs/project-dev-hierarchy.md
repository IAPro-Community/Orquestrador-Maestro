# Hierarquia DEV Dos Projetos

`DEV/` dá à próxima pessoa ou IA o contexto que a conversa sozinha não preserva: objetivo, evidência, riscos e próximo passo. Use esta referência ao estruturar um projeto; o uso diário está no [guia operacional](ai-agent-operating-guide.md).

Nos projetos que usam o Orquestrador Maestro, `DEV/` e a raiz canonica de documentacao e memoria operacional do projeto.

A intencao e economizar tokens: a IA le primeiro arquivos curtos de controle, entende o estado atual e so abre os detalhes necessarios para a tarefa.

## Estrutura Recomendada

```text
DEV/
  README.md
  INDEX.md
  HANDOFF.md
  CONTEXT.md
  SPECS/
    ACTIVE.md
  WORKLOG.md
  VERIFY.md
  ARCHITECTURE.md
  DECISIONS.md
  ADR/
  API/
  DATABASE/
  RUNBOOKS/
  TASKS/
  RESEARCH/
  HANDOFFS/
    WORKLOG_ARCHIVE.md
```

Hierarquias existentes continuam validas. Se o projeto ja usa `DEV/LOGS/`, `DEV/SQL/`, `DEV/ARCH/`, `DEV/WORKFLOWS/`, `DEV/TESTS/`, `DEV/DOCUMENTATION/` ou `DEV/BACKLOG/`, a IA deve respeitar esses caminhos e mapear tudo em `DEV/INDEX.md`, sem renomear por padrao.

Arquivos essenciais:

- `DEV/README.md`: entrada curta da documentacao do projeto.
- `DEV/INDEX.md`: mapa dos documentos disponiveis.
- `DEV/HANDOFF.md`: snapshot curto para a proxima sessao.
- `DEV/CONTEXT.md`: estado atual, restricoes, comandos, riscos e decisoes vivas.
- `DEV/SPECS/ACTIVE.md`: objetivo ativo, escopo, aceite e plano de verificacao.
- `DEV/WORKLOG.md`: hook cronologico curto do que foi feito.
- `DEV/VERIFY.md`: evidencias da ultima verificacao.

Estado de fase opcional:

- dentro de `DEV/SPECS/ACTIVE.md > ## Status`, o projeto pode declarar `Phase`, `Status`, `Next gate` e `Started at`;
- fases padrao: `discuss`, `plan`, `execute`, `verify`, `ship` e `handoff`;
- esses campos sao opcionais e projetos DEV legados continuam validos sem eles;
- quando presentes, `context brief` resume a fase atual e `check-dev-gates` valida os campos estruturados.

## Ordem De Leitura Da IA

1. `AGENTS.md` do projeto, se existir.
2. `DEV/README.md` ou `DEV/INDEX.md`.
3. `DEV/HANDOFF.md`.
4. `DEV/CONTEXT.md`.
5. `DEV/SPECS/ACTIVE.md`.
6. Documentos especificos da tarefa.
7. `DEV/WORKLOG.md` so quando handoff, contexto e spec nao bastarem.
8. Skills globais do Orquestrador.

A IA nao deve carregar a pasta `DEV/` inteira por padrao.

## Hook De Trabalho

Depois de trabalho substancial, a IA deve atualizar:

- `DEV/WORKLOG.md` com uma entrada curta;
- `DEV/VERIFY.md` com comandos e resultado;
- `DEV/HANDOFF.md` com o snapshot da proxima sessao;
- `DEV/SPECS/ACTIVE.md` se o escopo, aceite ou status mudarem.

Template recomendado para o worklog:

```text
## YYYY-MM-DD - Titulo curto

- Spec: `DEV/SPECS/ACTIVE.md` ou documento equivalente
- Changed: caminhos ou areas mexidas
- Why: uma frase
- Verified: comando ou checagem manual
- Risks: so riscos ativos
- Next context: so o que a proxima IA precisa saber
```

Tambem deve atualizar:

- `DEV/INDEX.md` quando criar, renomear ou remover documentacao.
- `DEV/CONTEXT.md` quando mudar estado atual, comandos, arquitetura, ambiente ou riscos.
- O arquivo especifico da sub-hierarquia quando uma decisao ou fato duravel mudar.

## Compactacao E Gates

`DEV/WORKLOG.md` nao deve virar transcricao longa.

Use os helpers:

```bash
orquestrador-maestro compact-worklog --project-path . --keep 12
orquestrador-maestro check-dev-gates --project-path . --max-entries 12 --strict
```

O primeiro mantem so as entradas recentes no `WORKLOG`, move historico para `DEV/HANDOFFS/WORKLOG_ARCHIVE.md` e atualiza `DEV/HANDOFF.md`.

O segundo valida se a combinacao `spec + handoff + verify + worklog` esta inteira e compacta o bastante para evitar loops e leitura desnecessaria. Quando o estado de fase estruturado estiver presente, ele tambem valida `Phase`, `Status`, `Next gate` e `Started at`, e imprime acoes corretivas concretas. O flag `--max-entries` deixa explicito qual limite o `WORKLOG` pode ter antes de falhar.

## Criar DEV Em Um Projeto

Depois de instalar o Orquestrador, voce pode criar a hierarquia assim:

```bash
orquestrador-maestro init-dev --project-path /caminho/do/projeto
```

Ou pelos scripts locais do clone:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\init-project-dev.ps1 -ProjectPath "C:\caminho\do\projeto"
```

Linux/macOS:

```bash
bash scripts/init-project-dev.sh --project-path /caminho/do/projeto
```

Helpers instalados no usuario:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.orquestrador\bin\init-project-dev.ps1" -ProjectPath "C:\caminho\do\projeto"
```

Linux/macOS:

```bash
bash "$HOME/.orquestrador/bin/init-project-dev.sh" --project-path /caminho/do/projeto
```

O script cria a estrutura base sem sobrescrever arquivos existentes.
