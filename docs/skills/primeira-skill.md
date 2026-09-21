# Sua primeira skill (exemplo comentado)

Este exemplo usa `skill-repo-health` porque ela não mexe em nada: só diagnostica. É a forma mais segura de ver o ciclo completo.

## Antes de começar

- Maestro instalado e `orquestrador-maestro verify` passando ([Comece aqui](../START-HERE.md)).
- Um repositório qualquer aberto no terminal (pode ser este próprio repo).
- Leia a página da skill: `docs/skills/reference/skill-repo-health.md`, nesta ordem:
  1. **Quando não usar** — confirma que seu pedido é do domínio dela.
  2. **Pré-requisitos e ferramentas externas** — só precisa de contexto do projeto e autorização compatível com risco médio.
  3. **Evidência mínima de conclusão** — teste/inspeção demonstrável + handoff com próximo passo.

## O pedido (copie e adapte)

Na sua ferramenta de IA, no diretório do repositório:

```text
Use a skill skill-repo-health neste repositório.
Entregue: stack, comandos de verificação, mapa de arquitetura,
riscos de entrega/segurança, gaps de documentação e próximos passos.
Não altere nenhum arquivo.
```

Por que assim: objetivo + skill explícita + saída esperada + limite (“não altere”). Limites evitam que a IA faça mais do que o pedido.

## O que esperar

1. A IA localiza instruções do projeto, `DEV/` (se existir), manifests, lockfiles, CI, testes e deploy — sem inventar comandos.
2. Ela roda só leitura (ex.: `git status` sem modificar) e marca o que for incerto.
3. Você recebe um relatório compacto com: stack, comandos de verificação, fontes de instrução, riscos, gaps de docs, confiança e próximas ações priorizadas.

## Como conferir que funcionou

- [ ] O relatório cita comandos reais do repo (não genéricos)?
- [ ] Achados incertos estão marcados como incertos?
- [ ] Há “próximos passos” priorizados e um handoff do que ficou pendente?
- [ ] Nenhum arquivo foi modificado (`git status --short` limpo)?

Se algum item falhar, a skill não concluiu — peça para completar a evidência mínima descrita em `docs/skills/reference/skill-repo-health.md`.

## Próximos exemplos

| Situação | Skill principal | Apoio | Ver em |
| --- | --- | --- | --- |
| Bug difícil com reprodução | `skill-systematic-debugging` | `skill-repo-health`, `skill-verification-before-completion` | `docs/skills/choose.md` |
| Tela de produto | `skill-frontend-excellence` | `skill-frontend-ux-guardrails`, `skill-webapp-testing` | `docs/skills/choose.md` |
| Release | `skill-release-engineering` | `skill-saas-security-scan`, `skill-verification-before-completion` | `docs/skills/recipes.md` |

Quando precisar combinar 2+ frentes com dependência entre etapas, troque este exemplo por uma receita em `docs/skills/recipes.md`.
