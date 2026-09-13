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
