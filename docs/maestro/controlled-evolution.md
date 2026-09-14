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
segurança e regressão quanto a tier, chamadas, reviewer, retries e outcome. Isso garante
política de contagem de chamadas; não prova economia de tokens. O benchmark harness existente
deve ser usado para tokens reais em execuções pareadas. Sem provider com contadores confiáveis,
publique `UNKNOWN` e não alegue percentual de economia.
