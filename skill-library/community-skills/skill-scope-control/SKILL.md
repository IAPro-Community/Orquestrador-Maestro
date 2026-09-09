---
name: skill-scope-control
description: Analisa se alterações, diffs e PRs continuam alinhados ao objetivo declarado, identificando escopo extra e propondo manter, separar ou justificar.
category: governance
risk: medium
source: https://github.com/shubhamsaboo/awesome-llm-apps/tree/main/scope-creep-detector
---

# Skill Scope Control

Use quando a conversa indicar que uma mudança pode ter crescido além do objetivo: “essa alteração ficou grande demais”, “o diff saiu do escopo”, “o PR está misturado” ou “o que não deveria estar aqui?”.

## Fluxo conversacional

1. Registre o objetivo em uma frase. Se ele não estiver claro, peça essa frase antes de classificar o diff.
2. Faça um inventário dos arquivos, subsistemas, dependências e comportamentos alterados.
3. Classifique cada descoberta com uma categoria canônica: `IN_SCOPE`, `REQUIRED_DEPENDENCY`, `DISCOVERED_WORK` ou `OUT_OF_SCOPE`.
4. `IN_SCOPE` pode ser executado quando atende diretamente um critério de aceitação. `REQUIRED_DEPENDENCY` só pode ser executado com justificativa, impacto e evidência da necessidade.
5. Registre `DISCOVERED_WORK` no mecanismo existente de follow-up/handoff e não o inclua silenciosamente no plano. Bloqueie `OUT_OF_SCOPE`.
6. Recomende manter, separar ou justificar explicitamente, sempre apontando a evidência.
7. Entregue um resumo curto com itens, risco de mistura e próximo passo.

O padrão é somente leitura: não edite, reverta, faça stage, commit ou push. A skill pode ser usada antes ou durante revisão de código, release ou planejamento.

## Contenção no autopilot

Para cada descoberta, atualize o task ledger ou handoff existente antes de agir. Somente `IN_SCOPE` e `REQUIRED_DEPENDENCY` justificada são elegíveis para execução. Uma tentativa de executar descoberta sem justificativa deve virar bloqueio, não uma autorização implícita.

## Ferramenta opcional

Se `scripts/scope_creep.py` já estiver disponível no projeto, ele pode ser usado para uma análise offline e reproduzível. Não instale nem execute código externo sem autorização. Passe o objetivo e os caminhos de forma segura, sem interpolar texto da conversa em comandos de shell.

## Guardrails

- Keep this skill compact; move long details into `references/` and link them from this file.
- Do not include tokens, local paths, logs, private project names, or stale API examples.
- Prefer project evidence over generic assumptions.

## Verification

- Confirm the requested behavior or decision is covered by local evidence.
- Run the relevant project validation gate when code, config, or operational behavior changes.

## Related Skills

- `skill-preflight` para definir o escopo antes de implementar.
- `code-review` para revisar qualidade e regressões depois da classificação.
- `skill-release-engineering` para separar mudanças antes de uma entrega.
