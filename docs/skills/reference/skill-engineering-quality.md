<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-engineering-quality

Use when a repository needs a quality baseline or modernization across one or more detected application stacks, especially linting, formatting, type checking, tests, build validation, developer tooling, hooks, or CI consistency.

| Campo | Valor |
| --- | --- |
| Categoria | engineering |
| Risco | medium |
| Disponibilidade | Nativa |
| Tags | engineering, quality, multi-stack |
| Aliases | engineering quality, qualidade de engenharia, boas práticas de projeto, boas praticas de projeto, configurar lint, setup de qualidade, quality baseline |

## Melhores casos de uso

- Configurar ou modernizar um baseline técnico de qualidade em repositórios frontend, backend, mobile, CLI, biblioteca ou monorepo.
- Preencher lacunas de formatter, lint/static analysis, typecheck/compile, testes, build, hooks e CI sem substituir tooling saudável.
- Padronizar qualidade em projetos multi-stack depois de detectar linguagem, framework, package/build manager e convenções existentes.

## Quando não usar

- Diagnóstico amplo do estado do repositório sem pedido de aplicar baseline; use skill-repo-health.
- Avaliação de uma skill, plugin ou MCP antes de adoção; use skill-quality-gate.
- Trabalho visual, design system, UX ou responsividade do produto; use skill-frontend-excellence.
- Atualização de dependências como objetivo principal; use skill-dependency-upgrade.
- Bug reproduzível e localizado que exige causa raiz; use skill-systematic-debugging.

## Exemplos de pedidos reconhecidos

- Aplique boas práticas neste projeto e detecte a stack antes de configurar as ferramentas.
- Configure lint, format, typecheck, testes e build neste repositório.
- Configure ESLint e Prettier somente se forem adequados ao setup existente.
- Crie um quality baseline para este backend sem trocar as ferramentas que já funcionam.
- Padronize a qualidade deste monorepo respeitando cada módulo.

## Pré-requisitos e ferramentas externas

- Acesso aos manifests, build files, lockfiles, configurações de qualidade e CI necessários para detectar a stack.

## Compatibilidade e instalação

| Client | Disponibilidade | Raiz/política |
| --- | --- | --- |
| agents | Nativa | .agents/skills |
| antigravity | Nativa | .antigravity-skills/skills |
| claude | Nativa | .claude/skills |
| codex | Nativa | .codex/skills |
| cursor | Nativa | .cursor/skills |
| gemini | Nativa | .gemini/skills |
| opencode | Nativa | .opencode/skills |
| windsurf | Nativa | .windsurf/skills |

A skill é sincronizada para as raízes nativas configuradas pela política de instalação.

## Recipes e chains relacionadas

- Nenhuma recipe registrada.
- Chain `skill-engineering-quality`

## Evidência mínima de conclusão

- Stack e módulos relevantes identificados a partir de evidência do repositório antes de escolher tooling.
- Mudanças aplicadas por delta, preservando convenções e ferramentas saudáveis ou justificando explicitamente qualquer migração.
- Checks aplicáveis de formatação, lint/static analysis, tipos/compilação, testes e build executados no estado final.
- CI permanece autoritativo e riscos ou gates não aplicáveis ficam explícitos.

Perfil de workflow: `strict` (entrada: `SKILL.md`).

## Proveniência

- Upstream: orquestrador-native
- Versão: bundled
- Licença: repository-license
- Steward: orquestrador-maintainers
- Revisado em: 2026-09-22
- Evidências: `orquestrador/skills/skill-engineering-quality/SKILL.md`, `orquestrador/skills/skill-engineering-quality/references/discovery.md`, `orquestrador/skills/skill-engineering-quality/references/quality-gates.md`

## Fonte canônica

[`orquestrador/skills/skill-engineering-quality/SKILL.md`](../../../orquestrador/skills/skill-engineering-quality/SKILL.md)
