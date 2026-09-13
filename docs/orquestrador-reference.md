# Referência técnica do Orquestrador

Este é o mergulho técnico para auditar como o Maestro escolhe skills, mantém o contexto curto e aplica regras entre ferramentas. Para uma visão orientada a tarefas, comece pelo [portal de skills](skills/README.md), pelo [guia de escolha](skills/choose.md) e pelas [receitas](skills/recipes.md). Para produto e instalação, consulte o [README](../README.md).

Esta página explica o mecanismo; não tenta substituir o [catálogo humano](skills/reference/README.md). O antigo [catálogo compacto](skill-catalog.md) é preservado por compatibilidade.

## Ideia central

O Orquestrador não é uma ferramenta única. É uma camada de regras, roteamento, skills e memória que prepara várias IAs para trabalhar com o mesmo processo no computador do usuário.

O fluxo esperado é:

1. Ler as regras globais do usuário.
2. Ler as regras do projeto atual.
3. Ler `DEV/INDEX.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md` e `DEV/SPECS/ACTIVE.md` quando existirem.
4. Escolher a skill mínima que resolve a tarefa e o perfil proporcional ao risco.
5. Executar com o menor contexto suficiente.
6. Verificar antes de concluir.
7. Atualizar `DEV/WORKLOG.md`, `DEV/VERIFY.md` e `DEV/HANDOFF.md`.
8. Compactar o worklog e rodar gates quando a tarefa for longa.

## Fontes de verdade

| Arquivo | Função |
| --- | --- |
| `orquestrador/rules.md` | Contrato global: hierarquia, qualidade, segurança, `DEV/`, verificação e sync. |
| `orquestrador/maestro.md` | Protocolo de execução: observar, rotear, selecionar, agir, verificar e reportar. |
| `orquestrador/hooks.md` | Orientações compactas para preflight, verificação, sync, skills e orçamento de tokens. |
| `orquestrador/SKILLS_INDEX.md` | Índice curto para encontrar o roteador sem carregar o catálogo completo. |
| `orquestrador/SKILLS_MANIFEST.json` | Manifesto canônico de metadados, proveniência e política de instalação. |
| `orquestrador/SKILL_ALIASES.json` | Mapeia termos do usuário para uma skill canônica. |
| `orquestrador/SKILLS_ROUTER.json` | Registro operacional de gatilhos, caminhos, custo e segurança. |
| `orquestrador/SKILL_CHAINS.json` | Define combinações possíveis depois que uma skill principal é escolhida. |
| `orquestrador/SKILL_RECIPES.json` | Fonte das combinações orientadas a resultado. |
| `orquestrador/SKILL_EXECUTION_PROFILES.json` | Define perfis `fast`, `standard`, `deep`, `multiagent`, `saas` e `security`. |
| `orquestrador/SKILL_USAGE_SCHEMA.json` | Esquema opcional para registrar uso de skills em JSONL. |
| `orquestrador/PROJECT_DEV_HIERARCHY.md` | Convenção da pasta `DEV/` em projetos. |
| `orquestrador/bin/dev-context-tools.js` | Helpers de compactação e gate para manter `DEV/` utilizável com baixo contexto. |

## Roteamento v2

O roteamento procura a melhor evidência, em vez de somar correspondências sem limite:

1. invocação canônica explícita, como `/skill:skill-repo-health`;
2. alias exato;
3. gatilho exato;
4. alias contido;
5. gatilho contido;
6. rota de capacidade.

Empates são resolvidos por especificidade, prioridade declarada e identificador lexical. Isso impede que aliases curtos como `saas` ou `ia` superem uma intenção completa. Também evita colisões entre “OWASP ZAP” (DAST), Evolution API (automação de WhatsApp) e campanhas de Meta Ads, nas quais a frase completa tem precedência sobre `whatsapp` isolado.

O resultado pode informar `routingVersion`, `confidence`, `matchedEvidence` e `ambiguities`. O mesmo corpus de aliases e gatilhos deve alimentar testes e exemplos publicados no [guia de escolha](skills/choose.md). Uma recipe ou chain só é aplicada quando o pedido exige mais de uma frente.

## Perfis de execução

| Perfil | Quando usar | Limite de skills | Delegação | Validação |
| --- | --- | ---:|---|---|
| `fast` | Resposta curta, ajuste pequeno ou tarefa óbvia. | 1 | Não | Verificação mínima útil. |
| `standard` | Caminho padrão para a maioria das tarefas. | 3 | Não | Validação proporcional à mudança. |
| `deep` | Mudança ampla, multissistema ou risco maior. | 5 | Sim | Lint, typecheck, teste, build ou doctor. |
| `multiagent` | O usuário pede agentes, time, swarm ou paralelismo. | 5 | Sim | Integração e verificação por frente. |
| `saas` | Produto SaaS, dashboard, pagamento, tenancy ou admin. | 5 | Sim | Gates do projeto e segurança. |
| `security` | Scan ou auditoria defensiva autorizada. | 4 | Sim | Gates de segurança; exige autorização explícita. |

## Hooks

No repositório, “hook” é uma regra operacional que dispara antes, durante ou depois do trabalho. Hooks de ferramenta lembram a ordem de leitura; o roteador central continua sendo a fonte da decisão.

| Hook | Onde fica | O que faz |
| --- | --- | --- |
| Preflight | `orquestrador/hooks.md` | Manda ler regras, `DEV/`, perfis, aliases e roteador antes de trabalho amplo. |
| Skill automático | `SKILLS_ROUTER.json`, `SKILL_ALIASES.json`, `SKILL_CHAINS.json` | Escolhe uma capacidade sem duplicar catálogos longos nos clients. |
| Orçamento de tokens | `orquestrador/hooks.md` | Limita skills por perfil e manda compactar o worklog quando necessário. |
| Verificação | `orquestrador/hooks.md` | Obriga evidência antes de declarar a tarefa concluída. |
| Gate de `DEV/` | `orquestrador/bin/dev-context-tools.js` | Valida `spec + handoff + verify + worklog` em tarefas longas. |
| Sync | `orquestrador/hooks.md` | Orienta `sync-skills.ps1 -Apply` ou `sync-skills.sh --apply` após mudar skill compartilhada. |
| Log de uso | `SKILL_USAGE_SCHEMA.json` | Define registro JSONL opcional de seleção e leitura de skills. |

## Instalação e sync

Os instaladores mantêm a biblioteca grande em `.orquestrador/skill-library/` e espelham apenas o núcleo nativo nas raízes compatíveis. Assim, uma skill pode ser nativa, sob demanda ou condicional sem que a documentação prometa instalação universal. A política detalhada está em [pacotes de skills](skill-packs.md) e a explicação para usuários está no [portal](skills/README.md).

O `sync-skills.ps1` e o `sync-skills.sh` mantêm skills canônicas nas raízes nativas:

```text
.codex/skills
.opencode/skills
.agents/skills
.claude/skills
.cursor/skills
.gemini/skills
.windsurf/skills
.antigravity-skills/skills
```

O sync deve preservar a margem livre definida pela política de instalação. Para VS Code, GitHub Copilot, Continue, JetBrains AI Assistant, Aider, Cline e Windsurf em nível de projeto, o caminho suportado é o bootstrap de projeto com `orquestrador-maestro init-dev --project-path <repo>`.

## Verificação

Use `scripts/verify-install.ps1` depois de instalar e `scripts/validate-public.ps1` antes de publicar. Para o catálogo de skills, a CLI oferece estes gates quando disponíveis:

```bash
orquestrador-maestro skill-catalog generate
orquestrador-maestro skill-catalog check
orquestrador-maestro skill-catalog validate
```

Para um projeto específico, o fluxo recomendado é:

```bash
orquestrador-maestro init-dev --project-path .
orquestrador-maestro check-dev-gates --project-path . --max-entries 12 --strict
orquestrador-maestro compact-worklog --project-path . --keep 12
```

A validação pública deve detectar JSON inválido, caminhos proibidos, diretórios locais, logs, backups, segredos prováveis, caminhos concretos de usuário e mojibake. Nenhum gate de documentação autoriza commit ou push automaticamente.
