# Evolução controlada do Maestro inspirada no Paperclip

Status: implementação incremental em andamento  
Escopo: extensões compatíveis do runtime do Maestro; sem dependência do Nexus.

## AS-IS

O Maestro já possui Mission e MissionBrief persistidos no `RunStore`, tasks semânticas no
planner, DAG/TaskGraph persistido, eventos duráveis, classificação determinística de risco,
políticas de compatibility/strict, catálogo e resolução seletiva de skills, contexto com
budget, evidence, verification, memória JSONL e recovery atômico.

O completion gate já relaciona critérios de aceite, evidência, verification, executor e
verifier. A revisão de plano já possui editor, compiler, semantic diff, aprovação e contador
de revisão. O benchmark harness já registra tokens com proveniência e usa `unavailable` quando
o provider não informa contadores.

Limitações relevantes encontradas:

- ancestry além de `missionId` não é explícita; parent task e decisão causadora não são
  consultáveis como relação;
- revisões de plano substituem o graph atual e não deixam um diff compacto no event stream;
- governança classifica risco, mas não expõe um orçamento cognitivo uniforme;
- review independente por risco não é executado pelo runtime;
- decision ledger, learning loop, skill evals e rollback semântico não devem ganhar fontes
  paralelas nesta etapa.

## GAP MATRIX

| Ideia observada | Estado atual | Decisão |
| --- | --- | --- |
| Goal ancestry | Mission e graph já vinculam tasks | Estender agora |
| Outcome contract | Objective, acceptance, evidence e gate já existem | Derivar, sem duplicar |
| Plan revision | Compiler, diff, approval e revision counter | Estender agora com evento |
| Policy engine | Change governance, compatibility e approval gates | Estender agora |
| Independent review | Gate verifica independência, sem reviewer por risco | Opt-in agora |
| Decision ledger | Events e memória cobrem parte do caso | Adiar; não criar ledger paralelo |
| Skill metadata/versioning | Manifest v2 já contém provenance/version | Adiar runtime |
| Runtime skill injection | Resolução existe; limites ainda não são uniformes | Adiar |
| Skill/strategy evals | Benchmark harness existente | Adiar, fora do caminho crítico |
| Semantic rollback | Recovery e git oferecem base parcial | Adiar |
| Engineering learning loop | Memória e promotion existem | Adiar |
| CEO/CTO/manager hierarchy | Não pertence ao fluxo Goal → Evidence | Rejeitar |

O Paperclip oficial apresenta goal ancestry, budgets, revisão, governance e auditabilidade
como capacidades úteis, mas também inclui org chart, heartbeat, controle operacional e
gestão de agentes. O Maestro adota somente os primeiros quando podem reutilizar seus contratos
atuais; provider/account, PTY, runtime hosting e scheduling continuam fora do Maestro.

## Contratos de compatibilidade

- novos campos são opcionais e aditivos;
- Mission continua sendo o Goal canônico; não há `GoalStore`;
- TaskGraph continua sendo a fonte do plano atual; eventos guardam apenas histórico compacto;
- Outcome Contract é uma visão derivada da DoD existente;
- reviewer é desligado por padrão e só pode ser habilitado por configuração explícita;
- tokens desconhecidos são reportados como `UNKNOWN`, nunca estimados como fato;
- nenhum componente novo descobre provider, troca conta ou depende do Nexus.

## Sequência de implementação

1. ancestry e visão derivada de outcome;
2. histórico de revisão de plano;
3. orçamento cognitivo determinístico;
4. reviewer independente opt-in por risco;
5. benchmarks, documentação de impacto e rollback.

## Fontes e decisões externas

- [Paperclip — repositório oficial](https://github.com/PaperclipAI/paperclip)
- [Paperclip — definição de Goal](https://github.com/PaperclipAI/paperclip/blob/master/doc/GOAL.md)

Este documento será atualizado após cada fatia com os contratos efetivamente implementados,
evidências de teste, impacto de tokens e instruções de rollback.

## IMPLEMENTED

- `SemanticTask.ancestry` opcional, com Mission como goal canônico e consulta
  `TaskGraphPersistence.ancestryForTask()`;
- `expectedOutcome` e `evidenceRequirements` aditivos, além de
  `deriveOutcomeContract()` derivado da objective/acceptance DoD;
- descriptor de revisão com parent, motivo, actor/source, diff semântico e tasks afetadas;
- evento durável `plan.revised`, sem cópia integral do plano;
- orçamento determinístico LEAN/STANDARD/ASSURANCE em `evaluateCognitiveBudget()`;
- reviewer independente opt-in, sessão nova, contexto limitado, artifact `REVIEW` e eventos
  `review.*`, usando somente adapters que declaram `supportsReadOnlyReview()`;
- telemetry de execução com chamadas, reviewers, retries, skills, outcome e provenance de
  token indisponível.

## REJECTED E DEFERRED

Não foram criados GoalStore, Decision Ledger paralelo, manager/CEO/CTO agents, scheduler,
provider discovery, gestão de contas, runtime hosting, skill studio, rollback semântico,
learning loop automático ou evals obrigatórios. Esses itens ficam para uma fase posterior
somente com evidência de valor e reutilização explícita dos stores/events/benchmark atuais.

## TOKEN IMPACT

Os testes determinísticos dos cenários A–E confirmam zero chamadas extras para LEAN,
STANDARD e reviewer desabilitado. ASSURANCE habilitado adiciona exatamente uma chamada,
apenas após execução bem-sucedida. A suíte não inventa tokens: contadores de provider ausentes
permanecem `unavailable`/`UNKNOWN`; percentuais reais dependem de execução pareada do benchmark
harness com provider configurado.

## ARCHITECTURE IMPACT

Os contratos alterados são aditivos em SemanticTask metadata, Run metadata, event families e
configuração de governança. Mission, TaskGraph, RunStore, evidence, verification, memory e
provider registry continuam sendo as fontes existentes. Não há migração obrigatória nem
dependência do Nexus.

## ROLLBACK E EVIDÊNCIA

Desligar `features.independentReview` remove o reviewer imediatamente. Os commits são
sequenciais e reversíveis: `1b88153`, `810a9d0`, `939a34e`, `77d18b0`, `4be503b` e `d5f6cab`.
Após cada reversão, rode `npm test`, `git diff --check` e a validação pública. A suíte final
registrou 983 testes aprovados, 6 skips e 0 falhas.
