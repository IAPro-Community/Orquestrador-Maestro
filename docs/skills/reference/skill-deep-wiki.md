<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-deep-wiki

Use when documenting or auditing a software product or repository, creating or improving README, Quick Start, guides, API/CLI/configuration references, troubleshooting, visual documentation plans, or checking documentation drift after product changes.

| Campo | Valor |
| --- | --- |
| Categoria | documentation |
| Risco | low |
| Disponibilidade | Sob demanda |
| Tags | documentation, product-docs, readme, quick-start, drift |
| Aliases | deep wiki, product documentation, product docs, documentação do produto, documentacao do produto, documentação completa, documentacao completa, criar readme, quick start, documentation drift |

## Melhores casos de uso

- Documentar completamente um produto/repositório a partir de capacidades verificadas.
- Criar ou melhorar README, TL;DR, Quick Start, guias, API/CLI/configuração, troubleshooting e documentação operacional.
- Auditar cobertura e documentation drift depois de mudanças no produto.

## Quando não usar

- Implementação de funcionalidade, correção de bug ou refatoração sem documentação abrangente como objetivo.
- Decisão arquitetural isolada ou ADR; use skill-adr.
- Diagnóstico amplo de saúde do repositório sem objetivo documental; use skill-repo-health.
- Avaliação global de produção/release; use os gates de qualidade/release apropriados.
- Automação genérica de navegador ou teste E2E como objetivo principal; use skill-browser-agent ou skill-webapp-testing.

## Exemplos de pedidos reconhecidos

- Documente completamente este projeto.
- Crie README, Quick Start e documentação das funcionalidades deste produto.
- Audite a documentação e identifique funcionalidades sem documentação.
- Compare o código atual com a documentação e encontre documentation drift.
- Documente a API e a CLI sem inventar capacidades não verificadas.

## Pré-requisitos e ferramentas externas

- Acesso ao repositório e às fontes de evidência necessárias para verificar as capacidades documentadas.

## Compatibilidade e instalação

| Client | Disponibilidade | Raiz/política |
| --- | --- | --- |
| agents | Sob demanda | .agents/skills |
| antigravity | Sob demanda | .antigravity-skills/skills |
| claude | Sob demanda | .claude/skills |
| codex | Sob demanda | .codex/skills |
| cursor | Sob demanda | .cursor/skills |
| gemini | Sob demanda | .gemini/skills |
| opencode | Sob demanda | .opencode/skills |
| windsurf | Sob demanda | .windsurf/skills |

A skill permanece no catálogo canônico e é disponibilizada sob demanda; ela não ocupa uma raiz nativa por padrão.

## Recipes e chains relacionadas

- Nenhuma recipe registrada.
- Chain `skill-deep-wiki`

## Evidência mínima de conclusão

- Capacidades relevantes inventariadas antes da documentação final e claims importantes vinculados a evidência atual.
- README/TL;DR/Quick Start e referências aplicáveis refletem o produto atual sem capacidades inventadas.
- Comandos, links, exemplos, assets e build de documentação validados quando o projeto oferece meios para isso.
- Documentation drift, cobertura e gaps não verificados reportados explicitamente.

Perfil de workflow: `strict` (entrada: `SKILL.md`).

## Proveniência

- Upstream: orquestrador-native
- Versão: bundled
- Licença: repository-license
- Steward: orquestrador-maintainers
- Revisado em: 2026-09-22
- Evidências: `orquestrador/skills/skill-deep-wiki/SKILL.md`, `orquestrador/skills/skill-deep-wiki/references/evidence-and-discovery.md`, `orquestrador/skills/skill-deep-wiki/references/documentation-surfaces.md`, `orquestrador/skills/skill-deep-wiki/references/visuals-drift-validation.md`

## Fonte canônica

[`orquestrador/skills/skill-deep-wiki/SKILL.md`](../../../orquestrador/skills/skill-deep-wiki/SKILL.md)
