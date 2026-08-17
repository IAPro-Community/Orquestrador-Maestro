# Implementation Plan: M2 — Intent Refinement

**Goal:** Evoluir o Maestro para transformar uma intenção inicial em um `MissionBrief` confiável por meio da arquitetura "Hybrid State Machine + AI Advisor" (AI proposes, Core validates, Core applies, Core decides readiness).

**Constraints:**
- TDD obrigatório (Testes antes do código).
- Nenhuma refatoração destrutiva em contratos públicos existentes (como `--auto`, `AiInterviewer` ou `approveMissionBrief`).
- Falhas de parser/provider são atômicas e não devem contaminar o estado.

---

## Phase 1: IntentSpec, IntentUnknown e Lifecycle (Immutable State)

### Objetivo
Definir o modelo de estado (a Fonte de Verdade) `IntentSpec`, e o modelo `IntentUnknown`, operando sempre com imutabilidade e transições de ciclo de vida formais.

### Arquivos Envolvidos
- `runtime/planner/intent-spec.js` (Novo)
- `tests/intent-spec.test.js` (Novo)

### Contratos / Interfaces
- `createIntentSpec(baseIntent)`: Retorna um spec congelado (Object.freeze).
- `createIntentUnknown({ id, dimension, description, reason, blocking, status, metadata })`
- `isValidTransition(fromState, toState)`: Valida lifecycle (`CREATED`, `DISCOVERING`, `REFINING`, `WAITING_USER`, `READY`, `BRIEF_GENERATED`, `APPROVED`).

### Test Strategy
- **Immutability**: Validar que qualquer tentativa de modificar um `IntentSpec` via dot notation falha.
- **Invalid lifecycle transition**: Transições como `CREATED -> READY` ou `READY -> DISCOVERING` devem lançar exceção.

---

## Phase 2: RefinementProposal Contracts, Schema & Parser

### Objetivo
Definir o schema que será recebido do LLM (Advisor) contendo `updates`, `addRequirements`, `addConstraints`, `detectedUnknowns`, `question`, `recommendation`.

### Arquivos Envolvidos
- `runtime/planner/proposal-parser.js` (Novo)
- `tests/proposal-parser.test.js` (Novo)

### Contratos / Interfaces
- `parseRefinementProposal(rawLlmOutput)`: Extrai JSON de dentro de blocos Markdown e valida o schema. Em caso de falha sintática/semântica, lança `StructuredOutputError`.

### Test Strategy
- **Malformed structured output**: Parse deve emitir `StructuredOutputError` e não tentar corrigir parcialmente.
- **Provider crash**: Um string vazio ou não serializável falha limpo.

---

## Phase 3: ProposalValidator e applyProposal (Atomicity)

### Objetivo
Validar uma proposta gerada contra o `TaskRelevantContext` (evitando redundâncias e contradições) e aplicar de forma imutável (merge) originando o `IntentSpec'`.

### Arquivos Envolvidos
- `runtime/planner/proposal-validator.js` (Novo)
- `tests/proposal-validator.test.js` (Novo)

### Contratos / Interfaces
- `validateProposal(proposal, intentSpec, taskRelevantContext)`: Avalia fatos. Pode omitir perguntas redundantes se a dimensão já está saciada.
- `applyProposal(intentSpec, validProposal)`: Mescla arrays (evita duplicatas), resolve `unknowns`, e atualiza estado gerando um novo `IntentSpec`.

### Test Strategy
- **Proposal atomicity / Provider fail**: Exceção lançada pelo validador mantém o spec original inalterado.
- **Context contradiction suppression**: Se a proposta inclui uma pergunta "REST vs GraphQL", mas o M1 provou ser REST em 100%, o validador destrói a `question` e registra a resposta.
- **Duplicate merging**: Arrays de `addRequirements` não criam dados reduntantes.

---

## Phase 4: IntentReadinessEvaluator

### Objetivo
Avaliador puro que define se o refinamento alcançou o `READY`. Zero blockers NÃO significa pronto se as dimensões chaves estiverem vazias.

### Arquivos Envolvidos
- `runtime/planner/readiness-evaluator.js` (Novo)
- `tests/readiness-evaluator.test.js` (Novo)

### Contratos / Interfaces
- `evaluateReadiness(intentSpec)`: Retorna boolean e a lista de blockers residuais. `ready = requiredDimensionsSatisfied && blockingUnknowns.length === 0`.

### Test Strategy
- **Unknown OPEN blocking**: Impede `READY`.
- **Unknown RESOLVED blocking**: Não impede `READY`.
- **Dimensão obrigatória ausente**: Mesmo com 0 blockers, continua `NOT READY`.

---

## Phase 5: IntentQuestion e Adaptive Refinement

### Objetivo
Construir o gerador de questões baseadas no `unknown` bloqueante e a interação segura com o usuário.

### Arquivos Envolvidos
- `runtime/planner/intent-question.js` (Novo)
- `tests/intent-question.test.js` (Novo)

### Contratos / Interfaces
- Estrutura: `{ id, dimension, text, options, blocking, reason, allowFreeText, allowRecommendation }`.

---

## Phase 6: Recommendation Lifecycle

### Objetivo
Gerenciar o caso onde a IA oferece uma solução, exigindo consentimento explícito.

### Arquivos Envolvidos
- `runtime/planner/recommendation-manager.js` (Novo)
- `tests/recommendation-manager.test.js` (Novo)

### Contratos / Interfaces
- `resolveRecommendation(recommendation, userAccepted)`: Promove a recomendação aceita para `USER_DECISION`.

### Test Strategy
- **RecommendationProposal não vira USER_DECISION**: Garantir que as recomendações geradas pendem aprovação.
- **Recommendation rejeitada**: Não contamina `IntentSpec`.

---

## Phase 7: MissionBriefBuilder

### Objetivo
Extrair o MissionBrief estruturado a partir da especificação amadurecida.

### Arquivos Envolvidos
- `runtime/planner/mission-brief-builder.js` (Novo)
- `tests/mission-brief-builder.test.js` (Novo)

### Contratos / Interfaces
- `buildMissionBrief(intentSpec, taskRelevantContext, resolvedSkills)`: Consome dados estruturados e converte para o formato legado do `MissionBrief`.

### Test Strategy
- **MissionBrief is derived**: Testar que não é apenas um dump de histórico de conversa, mas sim extração formal de `requirements`, `userDecisions` e `constraints`.

---

## Phase 8: AiInterviewer Compatibility Façade & CLI

### Objetivo
Conectar o engine antigo para usar este pipeline robusto de state machine por debaixo dos panos. Manter o CLI operando sem quebras.

### Arquivos Envolvidos
- `runtime/planner/ai-interviewer.js` (Modificado)
- `bin/orquestrador-maestro.js` (Modificado levemente para respeitar falhas do `--auto`)

### Contratos / Interfaces
- Mantém `runInteractive()`, `runBatch()` e `buildSpec()`.
- O `runBatch` (ativado pelo `--auto`) agora verifica se há blockers. Se sim, falha (Abort).

### Test Strategy
- **AiInterviewer legado continua compatível**: O contrato retorna os mesmos formats.
- **--auto com blocker aborta**.
- **--auto com non-blocking resolve e prossegue**.

---

## Phase 9: Persistence, Backward Compatibility & End-to-End

### Objetivo
Verificar a persistência do novo `IntentSpec` via `runStore` garantindo compatibilidade da `IntentSession` salva anteriormente.

### Arquivos Envolvidos
- `runtime/store/json-file-run-store.js` (Modificado para lidar com os novos campos opcionais)
- `tests/store-compatibility.test.js` (Criado)

### Test Strategy
- **Backward Compatibility**: Sessões antigas carregam perfeitamente sem Lifecycle e IntentSpec.
- **E2E**: Fluxo real `Raw Intent -> M1 Context -> ... -> MissionBrief`.
- **All previous tests pass**: Legado M0 e M1 continuam no verde.

---

## Execução & Verificação

Comandos a serem usados durante a codificação de cada fase:
\`\`\`bash
npm test
node orquestrador/bin/check-dev-gates.js --project-path . --strict
\`\`\`

## Self-Review
- **TDD:** Todas as 9 fases descrevem a *Test Strategy* a ser implementada ANTES do código.
- **Immutability & Safety:** Fase 3 protege e previne contaminação parcial. Fase 2 e 8 blindam o parser/provider (retry bounded/crash atomicity).
- **Façade:** Fase 8 isola a quebra protegendo o `AiInterviewer` (não refazemos public API).
- **Sem Placeholders:** Todos os contratos foram expressos com interfaces explícitas.
- **Human Gate presered:** Fase 7 e a pipeline da CLI mantêm a invocação do aprovação de `MissionBrief`.
