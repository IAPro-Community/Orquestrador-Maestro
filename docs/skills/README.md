# Skills do Maestro

Skills são instruções especializadas que ajudam uma ferramenta de IA a executar um tipo de trabalho com contexto, limites e evidência proporcionais. Elas não são modelos, agentes autônomos, plugins obrigatórios nem autorização para agir fora do escopo pedido.

Este portal é o ponto de entrada para descobrir a capacidade certa. A documentação detalhada continua em português; o [README em inglês](../../README.en.md) oferece navegação equivalente e indica quando uma página ainda é detalhada apenas em português.

## Quatro caminhos

| Se você quer… | Comece aqui |
| --- | --- |
| Encontrar uma capacidade para sua situação | [Escolher por objetivo](choose.md) |
| Combinar capacidades em uma sequência | [Receitas operacionais](recipes.md) |
| Consultar todas as skills e seus metadados | [Referência completa](reference/README.md) |
| Auditar a fonte e o comportamento do roteador | [Referência técnica](../orquestrador-reference.md) |

## O que existe no ecossistema

O Maestro separa três tipos que podem aparecer juntos no mesmo fluxo:

- **Skill canônica:** registro mantido no manifesto do Orquestrador, com instruções, gatilhos, risco, compatibilidade e proveniência. É a unidade principal de roteamento.
- **Workflow OMX:** capacidade de execução do ecossistema OMX, como `plan`, `ralph`, `team` ou `ultrawork`. Pode chamar skills canônicas, mas não substitui o registro delas.
- **Skill comunitária:** conteúdo reutilizável da biblioteca comunitária. Fica disponível sob demanda e só se torna nativa quando a política de instalação declarar isso.

O [manifesto canônico](../../orquestrador/SKILLS_MANIFEST.json) descreve as skills. O [roteador](../../orquestrador/SKILLS_ROUTER.json), os [aliases](../../orquestrador/SKILL_ALIASES.json), as [chains](../../orquestrador/SKILL_CHAINS.json) e os [perfis de execução](../../orquestrador/SKILL_EXECUTION_PROFILES.json) orientam o uso; a referência humana é gerada a partir dessas fontes.

## Como o roteador decide

O pedido é comparado com a evidência mais específica disponível, nesta ordem:

1. invocação canônica explícita, como `/skill:skill-repo-health`;
2. alias exato;
3. gatilho exato;
4. alias contido na frase;
5. gatilho contido na frase;
6. rota de capacidade, quando a intenção é ampla.

Empates usam especificidade, prioridade declarada e identificador lexical. Uma frase específica deve vencer um termo curto: por exemplo, “campanha de WhatsApp no Meta Ads” não deve ser reduzida à automação genérica de WhatsApp, e “OWASP ZAP” identifica DAST. O resultado pode informar `routingVersion`, `confidence`, `matchedEvidence` e `ambiguities`.

O roteamento seleciona uma skill principal; [chains](../../orquestrador/SKILL_CHAINS.json) e [recipes](../../orquestrador/SKILL_RECIPES.json) só entram quando a tarefa realmente exige mais de uma frente. O roteador não autoriza commit, push, publicação, envio de mensagens, pagamentos, scans externos ou ações destrutivas.

## Disponibilidade e compatibilidade

“Disponível” não significa “instalado em toda ferramenta”. A referência usa estes estados:

| Estado | Significado |
| --- | --- |
| **Nativa** | Espelhada nas raízes nativas mantidas pelo sync e descoberta diretamente pelo client. |
| **Sob demanda** | Registrada no Maestro e carregável quando a tarefa pedir, sem ocupar todas as raízes nativas. |
| **Condicional** | Depende de ferramenta, serviço, sistema operacional, credencial ou autorização explícita. |
| **Não suportada** | Há incompatibilidade comprovada; não é um sinônimo de “não instalada”. |

O catálogo deve mostrar clients compatíveis, pré-requisitos e modo de instalação derivados da política de instalação. Consulte [pacotes de skills](../skill-packs.md) para entender a distribuição física.

## Escolher uma ou combinar várias

Use uma skill isolada quando o resultado couber em um único domínio e tiver uma verificação clara. Use uma [receita](recipes.md) quando houver dependências entre etapas — por exemplo, construir um SaaS, integrar pagamento e sincronizar entitlement — ou quando a evidência final depender de várias disciplinas.

Uma combinação recomendada deve declarar ordem, perfil, risco e evidência mínima. Skills de apoio não são carregadas por hábito: entram apenas quando o pedido, o projeto ou uma falha de verificação justificar.

## Antes de concluir

Toda execução deve deixar evidência proporcional ao risco: testes e build quando existirem, diff revisado, saída do scan quando autorizado, screenshot/pixel diff para mudanças visuais, migração validada para banco, ou fontes e decisão registrada para pesquisa. O [guia de escolha](choose.md) e cada página da [referência](reference/README.md) descrevem o resultado mínimo esperado.

Se o baseline, a autorização ou uma ferramenta externa necessária estiver ausente, registre a limitação e pare no gate correspondente. “A skill foi roteada” não é prova de que o trabalho foi concluído.
