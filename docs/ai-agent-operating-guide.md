# Guia para IAs resolverem tarefas

## Em três passos

1. Entenda o pedido e as regras aplicáveis.
2. Abra apenas o contexto e a skill necessários.
3. Execute, verifique e registre o que a próxima sessão precisa saber.

Este guia explica como uma IA trabalha depois que o Orquestrador Maestro está instalado. Use-o para configurar um agente, adaptar um prompt ou conferir o processo; para instalar o ambiente, comece pelo [guia de instalação](installation.md).

## Contrato Principal

A instalação coloca o contrato global em:

```text
Windows: %USERPROFILE%\AGENTS.md
Linux/macOS: $HOME/AGENTS.md
```

Toda IA que conseguir ler arquivos locais deve começar por ele. Esse arquivo aponta para a hierarquia real:

1. `%USERPROFILE%\.orquestrador\rules.md` ou `$HOME/.orquestrador/rules.md`
2. `%USERPROFILE%\.orquestrador\maestro.md` ou `$HOME/.orquestrador/maestro.md`
3. `%USERPROFILE%\AGENTS.md` ou `$HOME/AGENTS.md`
4. `AGENTS.md` mais próximo dentro do projeto atual, quando existir
5. `DEV/` do projeto atual, quando existir
6. Skill específica da tarefa

## Hierarquia DEV Do Projeto

Quando o projeto tiver uma pasta `DEV/`, a IA deve tratá-la como a raiz canônica de documentação operacional e memória local do projeto. Essa camada entra depois do `AGENTS.md` do projeto e antes da skill global.

A leitura deve começar pelo índice ou visão geral que existir, nesta ordem:

1. `DEV/AGENTS.md`
2. `DEV/README.md`
3. `DEV/INDEX.md`
4. `DEV/PROJECT.md`
5. `DEV/CONTEXT.md`

Depois disso, a IA deve abrir só os arquivos relevantes à tarefa, por exemplo `DEV/ARCHITECTURE.md`, `DEV/DECISIONS.md`, `DEV/ADR/`, `DEV/API.md`, `DEV/DATABASE.md`, `DEV/TESTING.md`, `DEV/RUNBOOK.md`, `DEV/ROADMAP.md` ou `DEV/TASKS.md`.

Hierarquias existentes como `DEV/LOGS/`, `DEV/SQL/`, `DEV/ARCH/`, `DEV/WORKFLOWS/`, `DEV/TESTS/`, `DEV/DOCUMENTATION/` e `DEV/BACKLOG/` são compatíveis. Não renomeie nem mova documentação existente só para encaixar outro padrão; atualize `DEV/INDEX.md` para mapear a estrutura real.

Não é para carregar toda a pasta `DEV/` por padrão. Se houver conflito, o `AGENTS.md` do projeto tem prioridade.

Documentação durável de projeto deve ser criada em `DEV/` por padrão. Depois de trabalho substancial, a IA deve atualizar `DEV/WORKLOG.md` com um resumo curto do que mudou, por quê, como foi verificado e qual contexto importa para a próxima sessão. Quando criar ou mover documentação, atualize `DEV/INDEX.md`; quando mudar estado, comandos, arquitetura, ambiente ou riscos, atualize `DEV/CONTEXT.md`.

## Fluxo Mental Esperado

Uma IA operando com o Orquestrador deve seguir este ciclo:

1. Observar o pedido do usuário e o projeto atual.
2. Ler as regras globais aplicáveis.
3. Consultar o índice e o roteador de skills.
4. Escolher o menor caminho seguro para resolver.
5. Executar a tarefa no projeto.
6. Verificar com teste, lint, build, validação ou checagem manual apropriada.
7. Reportar o que mudou, o que foi verificado e qualquer risco restante.

## Como Escolher Skills

Arquivos principais:

```text
%USERPROFILE%\.orquestrador\SKILLS_INDEX.md
%USERPROFILE%\.orquestrador\SKILLS_ROUTER.json
%USERPROFILE%\.orquestrador\SKILL_ALIASES.json
%USERPROFILE%\.orquestrador\SKILL_CHAINS.json
%USERPROFILE%\.orquestrador\SKILL_EXECUTION_PROFILES.json
```

No Linux/macOS, use os equivalentes em `$HOME/.orquestrador/`.

A lógica detalhada de roteamento, hooks, perfis, chains e agentes está em [orquestrador-reference.md](orquestrador-reference.md). Para descobrir e consultar as skills publicadas, use o [portal de skills](skills/README.md) e a [referência gerada](skills/reference/README.md); o [catálogo compacto](skill-catalog.md) permanece por compatibilidade.

Roteamento básico:

| Situação | Skill ou fluxo |
|---|---|
| Pedido ambíguo ou com risco de suposição | `deep-interview` |
| Usuário quer plano antes de mexer | `plan` ou `ralplan` |
| Implementação direta em projeto | `orquestrador-maestro` e skill específica |
| Execução persistente até terminar | `ralph` |
| Trabalho grande com paralelismo | `team` ou `ultrawork` |
| Revisão de código | `code-review` |
| Auditoria de segurança | `security-review` |
| Clonar/recriar site | `web-clone` |
| Diagnosticar instalação | `doctor` |

## Prompt Recomendado Para Usuários

Use este prompt quando abrir uma IA em um projeto:

```text
Use o Orquestrador Maestro instalado no meu usuário.
Leia primeiro meu AGENTS.md global (%USERPROFILE%\AGENTS.md no Windows ou $HOME/AGENTS.md no Linux/macOS), depois o AGENTS.md deste projeto se existir, e a pasta DEV deste projeto se existir.
Consulte as skills globais antes de decidir a abordagem.
Resolva a tarefa diretamente, verifique antes de concluir e não faça commit/push sem eu pedir.
Quando fizer trabalho substancial, registre o resumo em DEV/WORKLOG.md.
```

Para uma tarefa específica:

```text
Use o Orquestrador Maestro. Preciso que você implemente [descrever tarefa].
Leia as regras, escolha a skill correta, faça as alterações necessárias e rode a verificação mais adequada.
```

Para planejamento:

```text
Use $ralplan. Quero um plano para [descrever objetivo], com riscos, tradeoffs e sequência de execução.
```

Para execução longa:

```text
Use $ralph. Siga até concluir [descrever objetivo], verificando no final.
```

## Regras Para A IA

- Não inventar padrão novo antes de consultar o índice de skills.
- Não publicar dados privados, tokens, logs, histórico, `.env` ou caminhos pessoais.
- Não fazer commit nem push sem pedido explícito do usuário.
- Não apagar trabalho existente sem autorização.
- Preferir a verificação mais leve que realmente prove a mudança.
- Em mudanças maiores, rodar lint, typecheck, testes ou build quando existirem.

## Quando Algo Não Funcionar

Se a IA não encontrar as skills:

1. Verificar se `%USERPROFILE%\.orquestrador` existe no Windows ou `$HOME/.orquestrador` no Linux/macOS.
2. Rodar `scripts\verify-install.ps1` no Windows ou `scripts/verify-install.sh` no Linux/macOS a partir do clone do repositório.
3. Conferir se `%USERPROFILE%\AGENTS.md` foi instalado no Windows ou `$HOME/AGENTS.md` no Linux/macOS.
4. Pedir para a IA abrir `%USERPROFILE%\.orquestrador\SKILLS_INDEX.md` ou `$HOME/.orquestrador/SKILLS_INDEX.md`.

Se o problema for de login, API key ou token, configure isso na ferramenta específica. O Orquestrador não publica nem instala credenciais.
