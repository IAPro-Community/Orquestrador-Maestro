# Comece aqui (10 minutos)

Se você nunca usou o Orquestrador Maestro, siga esta página na ordem. Ela diz **o que fazer**, **onde está a informação** e **o que esperar** em cada passo.

Tempo estimado: 10 minutos para os passos 1–3. Os passos 4–5 são o uso diário.

## Passo 1 — Entenda a ideia (2 min)

Leia só isto:

1. `README.md` — seção “Por que usar” (o problema) e “Um processo, várias ferramentas” (a solução).
2. `docs/product/GLOSSARY.md` — só 4 termos por agora: **Skill**, **Compatible**, **Integrated**, **DEV**.

O que esperar: entender que o Maestro não é uma IA nem substitui sua ferramenta — ele organiza o processo (regras → contexto mínimo → execução → verificação → handoff).

Se travar em um termo: procure em `docs/product/GLOSSARY.md` antes de abrir qualquer outra página.

## Passo 2 — Instale (3 min)

Pré-requisito: Node.js 20 ou superior.

```bash
npm install -g @iapro/orquestrador-maestro-cli@latest
orquestrador-maestro install
orquestrador-maestro verify
```

O que esperar: o comando `verify` termina sem erro e as pastas do seu usuário são criadas (regras, skills, entrypoints). Detalhes por sistema operacional, dry-run e rollback estão em `docs/installation.md`.

Se falhar: vá direto para `docs/installation-troubleshooting.md` (não improvise comandos). Caso comum: skill visível no Codex mas não no OpenCode — seção “Skill ausente no OpenCode/DANTE”.

## Passo 3 — Configure seu primeiro projeto (2 min)

1. Leia `docs/project-dev-hierarchy.md` — só a “Estrutura Recomendada” e a “Ordem de Leitura da IA”.
2. Crie a pasta `DEV/` no seu projeto com o mínimo: `DEV/README.md`, `DEV/INDEX.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, `DEV/SPECS/ACTIVE.md`, `DEV/WORKLOG.md`, `DEV/VERIFY.md`.

O que esperar: qualquer IA (ou pessoa) nova no projeto abre `DEV/INDEX.md` → `DEV/HANDOFF.md` → `DEV/CONTEXT.md` e entende o estado sem ler o histórico inteiro.

## Passo 4 — Use sua primeira skill (3 min)

1. Abra `docs/skills/README.md` — seção “Quatro caminhos”.
2. Depois abra `docs/skills/choose.md` e ache sua situação na tabela (ex.: “Investigar um repositório desconhecido” → `skill-repo-health`).
3. Abra a página da skill em `docs/skills/reference/<nome>.md` e leia nesta ordem: **Quando não usar** → **Pré-requisitos** → **Evidência mínima de conclusão**.
4. Diga à sua IA: `Use a skill <nome> para <seu objetivo>`.

Exemplo completo e comentado: `docs/skills/primeira-skill.md`.

O que esperar: a IA lê só o contexto necessário, executa e entrega a evidência mínima descrita na página da skill (teste, diff revisado, handoff). “A skill foi roteada” não é conclusão — cadê a evidência?

Se a tarefa precisa de 2+ frentes (ex.: SaaS + pagamento + segurança): use `docs/skills/recipes.md` em vez de combinar por conta própria.

## Passo 5 — Verifique e registre (uso diário)

Toda entrega termina com:

1. Teste/build/lint quando existirem, ou checagem manual apropriada.
2. `git diff --check` sem erro.
3. Atualização curta de `DEV/WORKLOG.md` (o que mudou, por quê, como foi verificado) e `DEV/HANDOFF.md` (próximo passo).

Comandos de verificação do próprio Maestro: `QUICKTEST.md` (seção 5) e `node scripts/skill-catalog.js validate` (confere a contagem canônica atual).

## Mapa — onde encontrar cada informação

| Quero… | Onde |
| --- | --- |
| Instalar/atualizar/desinstalar | `docs/installation.md` |
| Algo deu errado instalando | `docs/installation-troubleshooting.md` |
| Entender como a IA deve trabalhar | `docs/ai-agent-operating-guide.md` |
| Organizar memória do projeto | `docs/project-dev-hierarchy.md` |
| Escolher skill | `docs/skills/choose.md` |
| Combinar skills | `docs/skills/recipes.md` |
| Detalhe de uma skill | `docs/skills/reference/<nome>.md` |
| Como o roteador decide | `docs/skills/README.md` + `docs/orquestrador-reference.md` |
| Privacidade (o que entra no repo) | `docs/privacy-model.md` |
| Benchmark/metodologia | `docs/benchmark.md` |
| Contribuir | `CONTRIBUTING.md` |
| Termos | `docs/product/GLOSSARY.md` |
| Índice completo | `docs/` (`docs/README.md`) |

## O que ignorar por agora

- `README-technical-reference.md`, `docs/orquestrador-reference.md`, `docs/rfcs/`, `docs/architecture/`: referência interna e evolução — só quando precisar.
- `skill-library/community-skills/`: biblioteca sob demanda — o roteador chama quando necessário.
- Diferença entre skill canônica, workflow OMX e skill comunitária (`docs/skills/README.md`): entenda em uma frase — “canônica = roteada pelo manifesto; workflow = sequência de execução; comunitária = sob demanda”. Detalhes depois.
