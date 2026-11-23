
# ADR 0068 — Maestro como Harness Orchestrator de engenharia

**Status:** aceito como direção, implementação incremental (não representa feature homologada).  
**Issue base:** [#67](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/67) e [#48](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/48).  
**Auditoria:** branch `v1`, baseline `dcf6631ddfb29ca9caba24c7ffa7ea73294c4cb3` (2026-11-22, America/Sao_Paulo).  
**Pesquisa:** [benchmark de dez projetos](../research/HARNESS_ORCHESTRATOR_BENCHMARK_2026.md).

## 1. Problema e decisão

A issue #67 estabeleceu uma distinção correta entre quem **continua** uma execução e quem **aceita** a entrega, e preservou o RunStore/worker. Isso é necessário, porém **não é uma fundação de produto suficiente**: um Goal Loop confiável ainda pode implementar uma solução inconsistente com a arquitetura, design system ou regras funcionais do repositório.

O Maestro é um **Harness Orchestrator de engenharia**, não um concorrente de coding agents, Ralph Loop ou providers com Goals nativos. Sua proposta é converter pedido natural em contexto e contrato verificável, impor restrições independentes e somente então coordenar execução. Nenhum framework de benchmark será importado como motor.

```text
Developer request
  -> ContextEngine / context-brief / Memory / Skills (discovery)
  -> IntentSpec + MissionBrief + TaskGraph (specification & ambiguity gate)
  -> Governance + ApprovalReceipt (policy & immutable contract)
  -> Execution strategy (choose single continuation owner)
     -> Existing Maestro RunStore / supervisor / provider adapter
  -> VerificationEngine + Resolution + ProofBundle (independent acceptance)
  -> Durable result + attributable knowledge (verified learning only)
```

Essas etapas **não são serviços, bancos, classes ou schedulers separados**. São fronteiras de responsabilidade mapeadas para a implementação existente. A saída de cada fase é metadado versionado em entidades canônicas já presentes.

## 2. Bounded contexts e propriedade dos dados

| Responsabilidade | Reutilizar | Evoluir somente onde há gap | Não criar |
| --- | --- | --- | --- |
| Engineering Context | `orquestrador/bin/context-brief.js`, `runtime/context/ContextEngine`, `ContextBudget`, contexto de Git, Skills e Memory | Inventário stack-agnostic, componentes/fachadas reais, referências de arquivo e hashes; invalidação em drift | Segundo indexador permanente ou store paralelo |
| Engineering Specification | `IntentSpec`, `MissionBrief`, `TaskGraphProposal`, `GraphValidator`, `PlanRevisionService` | Requisitos rastreáveis, ambiguidades impeditivas, aceites específicos, verificadores e dependências; formato simples conforme Complexity Gate | Spec Kit/OpenSpec inteiros ou banco de Specs duplicado |
| Engineering Governance | `change-governance`, `PlanApprovalGate`, `ApprovalReceipt`, manifest/worktree authority, policy enforcer | Aprovar comandos concretos, fontes de prova, scope e budget; proteger verificadores contra edição adversarial | Autoridade de policy no prompt, config gerada pelo agente, approvals implícitas |
| Engineering Execution | `ProviderRegistry`, `MaestroApplication`, `RunStore`, `submission-supervisor/worker` | Seleção de owner por versão/superfície/sessão, preflight e observabilidade; eventual managed retry *no mesmo* worker | Outro dispatcher/loop/ledger |
| Engineering Verification | `VerificationEngine`, `isTaskCompletionEligible`, `ResolutionEngine`, `ProofBundle` | Bind requisito → teste → execução → worktree/commit/diff; comandos não podem ser mutados para validar artificialmente; UI visual/a11y quando aplicável | Segundo mecanismo de verificação ou output autoatestado |
| Engineering Learning | Memory existente, evidências e outcome do RunStore | Promoção humana/qualificada por fonte, validade, projeto/stack, repetibilidade e revisão; histórico de falhas úteis | Outro sistema de memória ou promoção por texto do agente |

## 3. Contrato canônico mínimo (sem novos modelos equivalentes)

- **Contexto:** `ContextEngine` retorna fatos/sinais de stack e referências com provenance. `context-brief` já usa truncamento e digest por fonte. Reuso exige evidência de arquivo concreto; ausência de referência é `unknown`.
- **Especificação:** `IntentSpec` e o plano existente representam objetivo, critérios, dependências e bloqueios. O `planDigest` existente assina a DAG; extensões devem incluir digests de verificador e política apenas após schema versionado e migração compatível.
- **Autorização:** `ApprovalReceipt` e `ExecutableManifest` continuam canônicos. Nunca inferir aprovação de `--auto`, de um prompt, de uma flag ou do texto do provider. Reaprovação quando worktree/HEAD, contrato ou operação privilegiada mudar.
- **Estratégia de execução:** somente `native-provider` (headless comprovado) **ou** `maestro-managed` (worker e correção aprovados). Não iniciar dois owners; não trocar owner depois de dispatch. Fallback consentido somente antes dos efeitos.
- **Aceitação:** `Run.completed`, `Verification.passed` e `Resolution.validated` não são equivalentes. A prova deve apontar para o critério, Run, verificador, fonte e revisão exata. Um test runner verde que executou outro checkout não serve.
- **Memória:** lição só pode ser promovida após verificador/evidência rastreáveis e verificação de generalidade; knowledge nunca substitui política do projeto atual.

## 4. Política de exploração e UX por complexidade

O `ComplexityGate` atual já prevê MICRO, SIMPLE, STANDARD, COMPLEX e DEEP. **Preservar o roteador**: para MICRO/SIMPLE, inspeção pontual e no máximo uma pergunta impeditiva; tarefas com UI funcional, APIs, segurança, autorização ou regressões de dados exigem Spec curta e aprovação versionada; mudanças críticas exigem gates aprofundados. Não obrigar usuário a escrever uma Spec completa antes de a ferramenta inspecionar o repositório.

**Cenário de referência (fixture de raciocínio; não é execução real):**

> Quero criar uma tela de lançamento de notas seguindo todos os padrões da aplicação. Analise o que já existe, prepare o necessário e implemente até ficar validado.

- Discovery: ler importações/convenções, autenticação, UI kit, componentes/formularios/tabelas/fachadas, endpoints, contratos e suites existentes com links de proveniência.
- Stop de ambiguidade: se escala de notas, permissão de edição ou aprovação forem desconhecidas e não inferíveis, perguntar. Não criar regra escolar fixa no Maestro.
- Spec curta: mostrar fluxo alvo, reuse plan, critérios e verificadores (regras de faixa, restrições de acesso, carga, feedback visual e regressões relevantes) e escopo proibido; pedir aprovação delimitada.
- Estratégia: provider e modo reais por versão; emitir `BLOCKED_NEEDS_USER` se não houver cancel/recovery/budget/isolamento seguros.
- Execução: agente implementa no worktree aprovado; Maestro valida com verificadores independentes vinculados à revisão. Falha comprovada exige nova tentativa apenas se escopo e orçamento permitirem.
- Resultado: `VALIDATED` com receipt por critério no SHA exato **ou** bloqueio diagnosticado. Build verde não equivale a layout aprovado; conferir responsividade/acessibilidade em ambiente real quando exigidos.

**Estado atual do cenário:** apenas etapas existentes de discovery/plan/Run único e fixtures com adapters simulados. O fluxo completo Spec → aprovação bounded → correção real → validação visual/functional → overnight não foi homologado.

## 5. Decisões KEEP / IMPROVE / REUSE / DEPRECATE / ADD

- **KEEP:** CLI+Bridge independentes, ComplexityGate/Router, Skills, contexto/memória, TaskGraph/PlanReview, RunStore, worker fenced, Resolution e verificação canônicas. Mantêm comportamento de Runs simples.
- **IMPROVE:** fontes de contexto (não só Node/DEV), seleção contextual de componentes, verificadores fixados antes do dispatch, vínculo a revisão exata, qualidade de UI, estado financeiro `unknown`, classificação de falhas, justificativa de bloqueio e testes reais.
- **REUSE (ideias):** Specs/testes por cenário (Spec Kit), contratos de delta/artefatos (OpenSpec), stop conditions determinísticas (Metaswarm/Ralph), last-known-good workflow (Symphony), CI gate (Agensh), test integrity/receipts (MartinLoop), verificador vinculado ao worktree (Orkestra).
- **DEPRECATE:** nada comprovadamente redundante pode ser removido neste incremento. Futuramente inventariar planners/CLI legados com usage telemetry e plano de migração, nunca por nome parecido.
- **ADD, com controle:** versionamento de verificadores e fingerprint do worktree, quality profiles por stack, evidence/knowledge promotion, health/readiness separado de provider installed, e UX de status/proofs coerente. Nenhum novo motor.

## 6. Sequenciamento de execução e rollback

| Gate | Ação | Critério de saída |
| --- | --- | --- |
| P0-A | Recuperar CI verde, heartbeat de cancelamento e compatibilidade CLI | Testes completos e smoke terminam aprovados no mesmo SHA |
| P0-B | Binding de verificador, evidência e revisão; impedir script/fixture adulterado | Testes adversariais não conseguem produzir `VALIDATED`; regressão da CLI limpa |
| P0-C | Aprovação bounded, budget sem custo fictício, crash/recovery e worktree isolado | Processo duplo não duplica efeitos e drift bloqueia sem replay cego |
| P1-A | Context discovery stack-agnostic com padrões e componentes existentes | Fixture multi-stack prova reuso por arquivo e não inventa classes |
| P1-B | Spec curta/DoD executável baseado no Context/TaskGraph existentes | Pedido natural não exige prompt técnico extenso; critérios são versionados |
| P1-C | Provider native/headless E2E e fallback na mesma fila | >=2 CLIs reais, versão, cancel, restart e logs sanitizados |
| P2-A | UX CLI/Bridge: preview, aprovar, status, relatório e provas por critério | Feature flag OFF por padrão; nenhum sucesso sem recibo |
| P2-B | Memory learning/promotion com validade | Lição inválida, não geral ou sem prova não vira padrão |

**Rollout:** capacidade inicial apenas read-only e opt-in; comandos já existentes continuam. `runs.submit` e `RunStore` não ganham um segundo ledger; novos metadados precisam ser versionados e tolerantes a dados legados. **Rollback:** desligar gates/Goal novos sem apagar receipt, preservando `RECONCILIATION_REQUIRED` quando efeito externo não é comprovado.

## 7. Não-goals e riscos residuais

Não fazer deploy, merge, push, alteração destrutiva, acessar produção ou conceder secrets como efeito de “autonomia overnight”. Não prometer uptime de notebook suspenso, compliance automático nem conclusão garantida. Uma política em linguagem natural sozinha não é sandbox ou proteção contra execução de comandos arbitrários pelo coding agent. Sem autenticação/controles headless reais, Native Goal permanece `UNVERIFIED`. Testes fake/simulação qualificam integração de software, não homologação financeira ou operacional.

**Risco prioritário:** inferir `npm run test` depois de o agente alterar `package.json` permite que um verificador falso passe; uma proteção limitada ao despacho durável Node foi introduzida como primeiro passo. Ainda faltam proteção por origem/HEAD de todos os arquivos de teste, múltiplas stacks e comprovação de worktree binding como no Orkestra.

**Decisão final:** preservar a direção de ownership único da ADR 0067; evoluir ao Harness de seis responsabilidades acima. Não construir um novo Goal Loop, second scheduler, segundo store ou UI proprietária como premissa.
