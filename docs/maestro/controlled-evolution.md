# Evolução controlada e orçamento cognitivo

Esta página documenta os incrementos compatíveis inspirados em ideias úteis do Paperclip.
Ela não transforma o Maestro em um control plane organizacional e não cria dependência do
Nexus.

## Orçamento cognitivo

O runtime classifica cada tarefa de forma determinística:

| Classe | Seleção | Reviewer | Contexto padrão |
| --- | --- | --- | --- |
| `LEAN` | tarefa simples, baixo risco | nunca | 4.000 tokens estimados |
| `STANDARD` | default | nunca | 8.000 tokens estimados |
| `ASSURANCE` | risco alto/crítico ou change class estrutural | somente com flag | 12.000 tokens estimados |

Os valores são limites configuráveis, não estimativas de cobrança. Tokens reais só entram
quando o provider informa a contagem; caso contrário a telemetria usa `UNKNOWN`/`unavailable`.
As garantias de tier, quantidade de chamadas, retries e reviewer são determinísticas; custo,
latência e economia de tokens são medições econômicas dependentes do provider e não são
inferidas pela política.

`contextTokens`, `maxSkills` e `maxReviewers` são limites aplicados pelo runtime. `maxIntelligentRetries`
é reservado e permanece em zero chamadas automáticas nesta versão; `maxOverheadPercent` é apenas
um objetivo de telemetria até existirem medições econômicas reais.

Para configurar sem alterar o comportamento nativo:

```json
{
  "features": { "independentReview": true },
  "cognitiveBudget": {
    "assurance": { "contextTokens": 16000 }
  }
}
```

## Ancestry e outcomes

Mission continua sendo o Goal canônico. Tasks semânticas podem declarar `ancestry.parentTaskId`
e `ancestry.causedByDecisionId`; o graph valida o parent e a consulta `ancestryForTask()`
resolve Mission/Goal, outcome maior e referências sem um `GoalStore` novo.

O Outcome Contract é uma visão derivada: `objective` é intent/expected outcome,
`acceptanceCriteria` são acceptance conditions e `evidenceRequirements` são requisitos
adicionais de evidence. A DoD não é duplicada.

## Revisões de plano

`compileRevision()` produz metadata administrativa com `revisionId`, parent, motivo, actor,
source, timestamp, semantic diff, tasks afetadas, risco e estado de aprovação. O graph atual
continua na coleção `taskGraphs`; o evento `plan.revised` guarda apenas o diff compacto.

Revisões são sem modelo, reaproveitáveis após restart e não substituem o plano canônico.

## Reviewer independente

O reviewer é opt-in e proporcional ao risco. Com a flag desligada, não há chamadas extras.
Com a flag ligada, somente `ASSURANCE` recebe uma segunda execução do mesmo provider, com:

- sessão nova;
- nenhum transcript do executor;
- objetivo, critérios, constraints, verification, evidence e diff limitado;
- resposta JSON com `approved`, `rejected` ou `inconclusive`;
- artifact `REVIEW` e eventos `review.*`.

O provider precisa declarar `supportsReadOnlyReview()`. Se não declarar, o resultado é
`unavailable` e a execução de alto risco não é concluída. Não há descoberta automática,
troca de conta ou coordenação de provider.

## Rollback

- desligue `features.independentReview` para remover imediatamente a segunda chamada;
- remova ou reverta a revisão de configuração de orçamento para os defaults;
- campos de ancestry são opcionais e podem ser ignorados por leitores antigos;
- eventos `plan.revised` e `review.*` são históricos e não são necessários para executar
  tarefas legadas;
- para rollback de código, reverta os commits sequenciais em ordem inversa.

## Evidência e benchmarks

Os testes determinísticos cobrem os cenários de tarefa trivial, alteração normal, arquitetura,
segurança e regressão quanto a tier, chamadas, reviewer, retries e outcome. Isso garante a
política de contagem de chamadas; não prova economia de tokens. O benchmark harness existente
deve ser usado para tokens reais em execuções pareadas. Sem provider com contadores confiáveis,
publique `UNKNOWN` e não alegue percentual de economia.

## Observabilidade econômica (telemetria mínima)

Evolução do `cognitiveTelemetry` existente, sem sistema paralelo, sem SQLite novo e sem
governor paralelo. Quando o provider expõe dados, o run registra:

- `tool` (CLI: `codex`, `claude`, `opencode`, `agy`), `provider` (quando declarado
  pelo evento; senão `unknown`), `model` (quando exposto; senão `unknown`);
- `sessionId`, `runId`, `taskId`, `executionId`, `projectId`, `repositoryId`,
  `branch`, `headCommit`, `startedAt`, `completedAt`, `durationMs`, `status`;
- `tokenInput`, `tokenOutput`, `cachedInputTokens`, `cachedOutputTokens` (quando
  aplicável), `reasoningTokens` (se exposto), `modelCalls`, `toolCalls` (quando
  confiável), `reviewCalls`, `automaticRetries` (sempre `0` nesta versão: não há
  loop automático de retry idêntico no caminho `executeRun`);
- `childAgentsObserved` + `childAgents[]` (`agentId`, `parentAgentId`, `role`,
  `depth`, `providerNative`, `tokens`, `outcome`) somente quando o provider
  expõe sessões/agents filhos; caso contrário `[]`;
- `tokenSource`: `provider-reported` | `derived` | `estimated` | `unavailable`.
  Ausente é `null`/`unknown`, nunca `0`.

`tool != provider != model`. Nenhuma heurística frágil por nome: sem declaração
explícita do provider, `provider` permanece `unknown`.

Parsers vivem atrás do contrato de adapter (`runtime/telemetry/provider-usage.js`
+ `agent-topology.js`); o restante do Maestro não conhece formatos NDJSON de cada
CLI. Evento desconhecido é ignorado com metadados seguros; execução nunca quebra
por telemetria. Fixtures sanitizadas cobrem codex/claude/opencode/agy sem API paga.

Amplificação observada (`observedInputAmplification = childInput / primaryInput`)
só existe quando ambos são `provider-reported` e `> 0`; caso contrário `null`.
Limitação documentada no próprio objeto: o contexto útil único é desconhecido,
portanto o fator mede volume observado, não desperdício provado.

Duplicação futura usa hashes (`promptHash`, digests do manifesto do context brief),
nunca prompt completo. Mapeamento OpenTelemetry conceitual: Run → trace
(`traceId`), Execution → span (`spanId`), provider call → child span, agent →
span/attributes. Sem collector/backend nesta entrega.

Privacidade: telemetria padrão não persiste prompt, completion, source integral,
secrets, `.env`, credenciais, home paths absolutos ou PII — apenas hashes, IDs,
counts, sizes e metadados sanitizados com paths relativos.

RunStore JSON permanece o contrato; arquivos `runs.json` antigos continuam legíveis
(campos novos são opcionais). Se JSON se mostrar insuficiente para consultas futuras,
o requisito será documentado para um futuro `SQLiteRunStore` — sem migração agora.

Consulte com `orquestrador-maestro usage [--project-path PATH] [--limit N] [--json]`
ou `run inspect <id>`. Tokens indisponíveis aparecem como `unavailable`, nunca `0`.
