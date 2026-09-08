---
name: skill-impeccable
description: Orquestra melhorias de frontend inspiradas no Impeccable a partir de pedidos conversacionais de design, UX, acessibilidade, responsividade, tipografia, layout, cor, motion, clareza, hardening e polish.
category: frontend
risk: medium
source: https://github.com/pbakaus/impeccable
---

# Skill Impeccable

Transforme pedidos vagos de melhoria visual em um fluxo pequeno, explícito e verificável. O usuário não precisa conhecer nomes de comandos: interprete a intenção, explique o foco escolhido em uma frase e encaminhe apenas as skills complementares necessárias.

## Conversational Routing

Mapeie a linguagem natural para a menor intervenção útil:

- “Está com cara de IA”, “está genérico” ou “deixe mais marcante” → critique a direção, reduza padrões genéricos e use `skill-open-design-ui`.
- “Deixe mais profissional”, “polir” ou “melhorar a tela” → preserve a função, refine hierarquia, tokens e estados com `skill-modern-ui-patterns` e `skill-open-design-ui`.
- “Audite”, “está quebrando no celular”, “corrija UX” ou “veja acessibilidade” → use `skill-frontend-ux-guardrails` e, se houver navegação ou interação relevante, `skill-webapp-testing`.
- “Tipografia”, “espaçamento”, “layout”, “cores”, “animação”, “texto confuso” ou “responsivo” → trate como intervenção focal; não faça redesign amplo sem autorização.
- “Criar uma tela nova” ou “começar do zero” → defina primeiro público, objetivo, produto versus marca e direção visual; só então implemente.
- “Site premium”, “site cinematográfico”, “storytelling no scroll” ou “redesign estrutural” → encaminhe a estratégia e a narrativa para `skill-premium-web-experience`; intervenha aqui apenas no polimento focal.

## Workflow

1. Inspecione a superfície real, tokens existentes, componentes, rotas, estados e breakpoints antes de editar.
2. Leia `PRODUCT.md` e `DESIGN.md` se existirem. Se não existirem e o trabalho for amplo, proponha criá-los de forma compacta.
3. Declare o alvo e a intervenção: `shape`, `critique`, `audit`, `polish`, `typeset`, `layout`, `colorize`, `animate`, `clarify`, `harden`, `adapt`, `distill`, `quieter` ou `bolder`.
4. Preserve rotas, comportamento, permissões, analytics, contratos e componentes compartilhados, salvo pedido explícito em contrário.
5. Valide os estados afetados em pelo menos mobile e desktop; inclua loading, vazio, erro, foco, desabilitado e conteúdo longo quando aplicável.
6. Verifique ortografia, acentuação, UTF-8, contraste, overflow, foco de teclado e ausência de padrões decorativos sem função.

## Uso opcional da ferramenta externa

Se o projeto já tiver o CLI `impeccable` instalado, `npx impeccable detect <alvo>` pode ser usado como sinal determinístico adicional. Não instale dependências, não habilite hooks e não execute o modo live sem autorização explícita. A ferramenta externa não substitui inspeção visual, acessibilidade ou testes reais.

## Guardrails

- Não force um redesign completo quando o pedido for uma correção localizada.
- Não introduza gradientes, glassmorphism, brilho, cards aninhados, ícones gigantes ou animações apenas para “embelezar”.
- Não troque a fonte, paleta ou biblioteca de ícones sem verificar tokens e convenções existentes.
- Não use screenshots ou caches como fonte de verdade sem distinguir artefatos temporários de arquivos do projeto.

## Verification

Reporte o que foi alterado, quais viewports e estados foram verificados e qualquer risco visual restante. Para mudança de código, rode o gate disponível mais leve entre lint, typecheck, build, testes direcionados ou inspeção no navegador.

## Related Skills

- `skill-frontend-ux-guardrails`: qualidade, acessibilidade, responsividade e estados.
- `skill-modern-ui-patterns`: composição de interfaces SaaS e comportamento de componentes.
- `skill-open-design-ui`: direção visual, tokens e QA visual.
- `skill-premium-web-experience`: estratégia, narrativa e coordenação de experiências web premium.
- `skill-webapp-testing`: validação E2E e regressão visual quando o fluxo mudar.
