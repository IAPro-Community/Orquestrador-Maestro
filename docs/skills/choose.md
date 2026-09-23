# Escolher uma Skill por objetivo

Você não precisa começar pelo nome de uma Skill. Comece pelo **resultado que deseja** e deixe o Router v3 combinar intenção, complexidade e sinais do projeto.

Antes de executar, você pode inspecionar a rota:

```bash
orquestrador-maestro route explain "descreva aqui o trabalho"
```

Primeira vez? Veja [Sua primeira Skill](primeira-skill.md).

## Mapa rápido por intenção

| Se o seu objetivo é… | Skill que normalmente representa a intenção | Evite usar quando… |
| --- | --- | --- |
| Entender um repositório desconhecido | `skill-repo-health` | já existe um bug específico e reproduzível |
| Fazer preflight antes de uma mudança relevante | `skill-preflight` | a tarefa é mecânica e de baixo risco |
| Corrigir um bug por causa raiz | `skill-systematic-debugging` | o pedido é uma auditoria ampla sem falha concreta |
| Criar baseline de qualidade multi-stack | `skill-engineering-quality` | o objetivo principal é apenas upgrade de dependência ou UX |
| Validar antes de declarar “done” | `skill-verification-before-completion` | ainda estamos na investigação ou planejamento inicial |
| Registrar uma decisão arquitetural | `skill-adr` | a decisão já foi tomada e só falta implementar |
| Fazer pesquisa com fontes | `skill-research-and-synthesis` | não há necessidade de fontes atuais/comparação |
| Preparar release e rollback | `skill-release-engineering` | é apenas commit/PR comum |
| Fazer migração de banco | `skill-database-migrations` | não há mudança de schema/dados persistidos |
| Projetar integração com LLM/providers | `skill-ai-orchestration` | o foco é coordenação de agentes de desenvolvimento |
| Orquestrar vários agentes | `skill-multiagent-orchestration` | a tarefa é curta, serial ou não ganha com paralelismo |
| Documentar profundamente um produto/repo | `skill-deep-wiki` | a necessidade é apenas registrar uma decisão isolada |

Essa tabela é um mapa humano. O Router pode escolher outra Skill quando `doNotUseWhen`, stack, arquivos alterados, contexto ou risco indicarem uma rota melhor.

## Frontend, UX e design: qual usar?

Essa família merece atenção porque várias Skills trabalham na mesma superfície, mas em **níveis diferentes**.

| Skill | Papel principal | Pergunta que responde |
| --- | --- | --- |
| `skill-product-ux-architecture` | arquitetura de UX do produto | “os fluxos, estados e informação do produto fazem sentido?” |
| `skill-open-design-ui` | direção visual e composição | “como tirar esta interface da aparência genérica/template?” |
| `skill-impeccable` | auditoria visual e de usabilidade | “onde hierarquia, spacing, consistência e acessibilidade estão falhando?” |
| `skill-design-engineering-craft` | acabamento de implementação | “o que falta para esta UI parecer madura e bem construída?” |
| `skill-motion-design-principles` | movimento | “as animações e transições ajudam ou atrapalham?” |
| `skill-frontend-excellence` | execução frontend no produto real | “como implementar isso respeitando design system, responsividade e Visual QA?” |
| `skill-melhorar-ux-ui-por-referencia` | análise por referência visual | “o que devemos aprender desta screenshot/referência para melhorar nossa tela?” |
| `skill-frontend-ux-guardrails` | restrições de UX | “quais regras de interação/usabilidade não podemos violar?” |

### Exemplos

**“Redesenhe toda a experiência deste módulo.”**

Tende a começar por `skill-product-ux-architecture`; implementação pode depois exigir `skill-frontend-excellence`.

**“Esta tela parece template. Quero algo com identidade.”**

Tende a favorecer `skill-open-design-ui`.

**“Revise esta tela: tipografia, spacing, contraste e hierarquia.”**

Tende a favorecer `skill-impeccable`.

**“A interface já está boa, mas falta acabamento.”**

Tende a favorecer `skill-design-engineering-craft`.

**“As animações estão estranhas.”**

Tende a favorecer `skill-motion-design-principles`.

**“Use esta screenshot como referência.”**

Tende a favorecer `skill-melhorar-ux-ui-por-referencia`.

O objetivo é impedir que a palavra “design” carregue todas elas ao mesmo tempo.

## Engenharia e qualidade

### Investigar um projeto

Use `skill-repo-health` quando ainda precisamos descobrir:

- stack;
- estrutura;
- comandos;
- testes;
- CI;
- riscos;
- sinais de dívida.

Resultado esperado: findings priorizados e próximos passos.

### Aplicar baseline técnico

Use `skill-engineering-quality` quando o pedido é **melhorar o próprio baseline**:

- formatter;
- lint/static analysis;
- typecheck/compile;
- testes;
- build;
- hooks;
- CI.

Ela detecta a stack antes de escolher tooling e trabalha por delta, preservando configuração saudável existente.

### Corrigir um defeito

Use `skill-systematic-debugging` quando existe sintoma reproduzível, regressão ou teste falhando.

Resultado esperado:

```text
reprodução
→ hipótese
→ causa raiz
→ correção focada
→ regressão testada
```

Não transforme todo bug em auditoria completa do repositório.

## Segurança, release e dados

| Situação | Rota principal |
| --- | --- |
| Modelar ameaças e fronteiras de confiança | `skill-threat-modeling` |
| Configurar gates recorrentes de segurança | `skill-security-hooks` |
| Fazer scan defensivo autorizado | `skill-saas-security-scan` |
| Fazer DAST/recon em alvo autorizado | `skill-saas-dast-recon` |
| Preparar release/smoke/rollback | `skill-release-engineering` |
| Alterar schema/dados persistidos | `skill-database-migrations` |
| Trabalhar especificamente com Supabase RLS | `skill-supabase-rls` |

Scans externos, produção, pagamentos e ações destrutivas continuam sujeitos a autorização/policy. Routing não é autorização.

## IA e agentes

Não confunda três problemas diferentes:

### Integração de IA no produto

`skill-ai-orchestration`

Use para providers, models, fallback, budgets, segurança de chaves e arquitetura server-side.

### Observar agentes/IA

`skill-agent-observability`

Use para tracing, custo, latência, qualidade e regressões de agentes.

### Dividir trabalho entre agentes

`skill-multiagent-orchestration`

Use quando o usuário realmente pediu delegação/subagents e a tarefa complexa possui trabalho independente.

Complexidade alta sozinha **não ativa multiagent**.

## SaaS e integrações

Use Skills de domínio quando o problema realmente pertence àquele domínio.

Exemplos:

- `skill-saas-factory` — produto SaaS amplo;
- `skill-saas-core-limits` — planos, quotas e entitlements;
- `skill-saas-admin-dashboard` — administração;
- `skill-stripe-integration` — Stripe;
- `skill-abacatepay-integration` — AbacatePay;
- `skill-google-workspace-sync` — Google Workspace;
- `skill-evolution-api` — integração específica Evolution API;
- `skill-live-processing` / `skill-manual-video-processing` — mídia.

Não combine integrações diferentes “por garantia”. Cada dependência carregada aumenta contexto, risco e superfície de falha.

## Quando usar uma receita

Uma Skill isolada é suficiente quando um único domínio cobre o resultado e a verificação.

Use uma [receita](recipes.md) quando há etapas realmente dependentes.

Exemplo:

```text
preflight
  ↓
implementação
  ↓
security/release quando aplicável
  ↓
verification
```

A receita não significa que todas as Skills previstas serão sempre carregadas. O projeto e a evidência decidem.

## O que pode mudar a rota

- **Intenção explícita:** `/skill:<id>` ou alias exato tem evidência forte.
- **Negative routing:** uma Skill pode declarar casos em que não deve ser usada.
- **Stack:** React, Node, Go, Java, .NET, Python, Docker, Kubernetes e outras detecções alimentam capabilities.
- **Arquivos alterados:** frontend, testes, migrations, CI, containers e docs ajudam a delimitar escopo.
- **Contexto obrigatório:** ausência pode reduzir a adequação de uma Skill.
- **Memória verificada:** quando disponível, pode fornecer hints de Skill.
- **Complexidade:** limita quantidade de Skills e contexto.
- **Autorização:** routing nunca substitui policy/consentimento.

## Se ainda houver dúvida

Rode:

```bash
orquestrador-maestro route explain --json "seu pedido"
```

Depois consulte a [página individual da Skill](reference/README.md) para entender:

- quando usar;
- quando não usar;
- contexto;
- outputs;
- verificação;
- risco;
- disponibilidade.

O catálogo é a referência. O `route explain` é a explicação operacional.
