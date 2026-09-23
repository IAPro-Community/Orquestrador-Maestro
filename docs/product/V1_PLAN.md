# Plano V1 — Context & Skill Intelligence

> **Status:** implementação ativa — `1.0.0-alpha.1`  
> **Branch:** `feature/upstream-consolidated-v1`  
> **Base:** `IAPro-Community/Orquestrador-Maestro:main` após PR #23 / release `0.5.0` (`09e7bf70306bac7dd9238089a0d845d05427bc64`)  
> **Target:** `1.0.0`  
> **Última atualização:** 2026-09-22

## 1. Objetivo da V1

A V1 consolida o Orquestrador Maestro como um **meta-orquestrador de conhecimento e processo para desenvolvimento com IA**.

O Maestro não deve competir com Codex, Claude Code, OpenCode, Cursor ou outros runtimes. Ele deve tornar qualquer um deles mais eficiente ao:

1. entender a intenção do desenvolvedor;
2. classificar complexidade, risco e escopo;
3. escolher a skill/processo correto;
4. carregar o menor contexto suficiente;
5. reaproveitar contexto e conhecimento já válidos;
6. encadear novas capacidades somente quando a evidência exigir;
7. verificar o resultado;
8. aprender com o uso para reduzir desperdício futuro.

Fluxo alvo:

```text
pedido
  ↓
Intent
  ↓
Complexity Gate
  ↓
Capability Routing
  ↓
Skill Selection
  ↓
Context Requirements
  ↓
Context Compiler
  ↓
Executor/Provider
  ↓
Verification / Resolution
  ↓
Reusable Knowledge + Skill Effectiveness
```

## 2. Não objetivos

A V1 não deve:

- virar IDE;
- criar chat próprio;
- substituir Codex/Claude/OpenCode;
- criar runtime próprio de modelos;
- criar scheduler/swarm próprio;
- duplicar subagents nativos dos providers;
- criar outro Resolution Engine;
- criar outro sistema de Evidence;
- criar outro mecanismo de memória paralelo;
- aumentar fan-out para tarefas simples;
- transformar toda tarefa em planejamento profundo.

Regra arquitetural:

> Se a funcionalidade deixa de ter valor quando o provider é trocado, provavelmente não pertence ao núcleo do Maestro.

## 3. Por que 1.0.0

O salto para 1.0.0 é adequado se estes contratos ficarem estáveis:

- identidade e schema canônico de Skill;
- semântica de roteamento;
- Complexity Gate;
- formato de Context Pack;
- invalidação/cache de contexto;
- Repository Knowledge Map;
- métricas de eficácia;
- contrato canônico V2 nativo para skills Maestro, sem fallback legado;
- comportamento fail-safe quando não houver confiança suficiente.

A versão não deve ser publicada diretamente como estável durante desenvolvimento.

Estratégia:

```text
0.5.0 / PR #23
      ↓
1.0.0-alpha.1  ← linha atual
      ↓
1.0.0-alpha.*
      ↓
1.0.0-beta.*
      ↓
1.0.0-rc.*
      ↓
1.0.0
```

## 3.1 Política de compatibilidade da V1

A V1 assume uma quebra deliberada no contrato das **skills canônicas do Maestro**.

Regras:

- toda skill `maestro/*` deve implementar Skill Contract V2 nativamente;
- não existe projeção legado → V2 para skills Maestro;
- manifesto canônico V3 é obrigatório;
- `routing`, `maturity`, `context`, `outputs` e `verification` têm uma única fonte de verdade;
- campos duplicados do contrato anterior, como `triggers`, `status`, `workflow.validation`, `documentation.notFor` e `documentation.expectedEvidence`, não fazem parte do manifesto canônico V3;
- uma versão antiga do Maestro continua autocontida; quem atualizar para V1 recebe o novo contrato integralmente.

A quebra **não** se aplica às skills externas ao Orquestrador:

```text
library / external
user skills
project skills
        ↓
compatibility adapter
        ↓
Skill Contract runtime
```

Essas skills continuam sendo descobertas e executadas sem exigir que seus autores adotem o manifesto V3 do Maestro. Presença no catálogo externo também não concede auto-routing: sem evidência/routing confiável, permanecem explicit-only.

## 4. Os 12 workstreams da V1

### V1-01 — Normalização do catálogo de Skills

**Problema**

O catálogo atual possui múltiplas origens, shadowed duplicates e IDs conflitantes. A V1 não deve ampliar o catálogo antes de estabilizar identidade e governança.

**Entregas**

- criar Skill Registry canônico;
- definir schema V2;
- resolver IDs conflitantes;
- distinguir:
  - `maestro-core`;
  - `maestro-domain`;
  - `external/imported`;
- deduplicar por identidade canônica;
- preservar aliases de invocação como UX pública, sem manter o schema legado das skills Maestro;
- adicionar versionamento de skill;
- adicionar maturity: `experimental | stable | deprecated`;
- adicionar ownership/origin;
- adicionar `useWhen`;
- adicionar `doNotUseWhen`;
- adicionar `context.required`;
- adicionar `context.useful`;
- adicionar `context.avoid`;
- adicionar outputs esperados;
- adicionar estratégia de verificação;
- adicionar cost/context profile.

**Definition of Done**

- zero IDs conflitantes no catálogo canônico;
- zero duplicatas ambíguas;
- manifest gerado deterministicamente;
- 100% das skills `maestro/*` nativas no contrato V2 e zero fallback legado;
- catálogo completo não precisa ser carregado no prompt.

---

### V1-02 — skill-git-workflow

Skill de uso diário para operações Git simples e avançadas.

**Cobertura**

- status;
- diff;
- stage;
- commit;
- amend;
- stash;
- branch;
- merge;
- rebase;
- cherry-pick;
- conflitos;
- reset/revert com proteção;
- push/pull;
- análise de histórico.

**Regra principal**

Operações mecânicas devem permanecer `MICRO`/solo, sem planejamento profundo ou subagents.

**DoD**

- testes positivos e negativos de roteamento;
- casos de operações destrutivas explicitamente protegidos;
- commit simples não carrega skills de arquitetura/review/multiagent.

---

### V1-03 — skill-issue-resolution

Skill top-level para:

```text
Issue
→ entender
→ recuperar contexto
→ reproduzir
→ identificar causa
→ corrigir
→ validar
→ preparar handoff/PR
```

Deve encadear dinamicamente capacidades existentes em vez de duplicá-las.

Possíveis downstream:

- systematic-debugging;
- database-migrations;
- security;
- frontend;
- verification-before-completion;
- pr-lifecycle.

**DoD**

- issue simples usa no máximo as capacidades necessárias;
- histórico/contexto já conhecido é reaproveitado;
- não carrega cadeia inteira antecipadamente.

---

### V1-04 — skill-pr-lifecycle

Responsável pelo ciclo do pull request:

- readiness;
- escopo;
- diff;
- descrição;
- changelog quando aplicável;
- CI;
- comentários;
- review;
- pendências;
- evidências;
- preparação para merge.

Deve aproveitar:

- scope-control;
- code-review;
- verification-before-completion;
- release-engineering quando aplicável.

**DoD**

- identifica claramente blockers vs sugestões;
- não executa review profundo para PR trivial sem evidência;
- produz status de readiness rastreável.

---

### V1-05 — skill-ci-troubleshooting

Skill dedicada a pipelines quebradas.

**Cobertura**

- GitHub Actions;
- GitLab CI;
- comandos locais equivalentes;
- logs;
- matrix builds;
- cache;
- artifact;
- environment mismatch;
- flaky tests;
- dependências;
- build/test/lint/typecheck.

Fluxo:

```text
pipeline failure
→ identificar stage/job
→ extrair failure fingerprint
→ reproduzir mínimo possível
→ localizar causa
→ corrigir
→ validar
```

**DoD**

- contexto de CI é carregado antes de contexto amplo do repo;
- falha conhecida não força nova investigação completa;
- fingerprints reutilizáveis podem ser persistidos em memória.

---

### V1-06 — skill-test-engineering

Skill para estratégia e implementação de testes.

**Cobertura**

- unit;
- integration;
- contract;
- E2E;
- regression;
- flaky;
- fixtures;
- mocks;
- coverage útil;
- seleção do menor teste que prove comportamento.

**Regra**

Não otimizar por percentual de coverage isoladamente.

**DoD**

- selecionar tipo de teste conforme risco/comportamento;
- evitar criação automática de E2E quando teste menor é suficiente;
- integração com verification-before-completion.

---

### V1-07 — Complexity Gate

> **Implementação:** entregue e ativa no fluxo padrão desta linha V1. O gate é determinístico, precede Router v3, limita skills/contexto e não habilita multiagent apenas por complexidade.

Gate antes do roteamento completo.

Classes iniciais:

```text
MICRO
SIMPLE
STANDARD
COMPLEX
DEEP
```

Exemplos:

```text
git commit                       → MICRO
corrigir typo                    → MICRO
adicionar teste local            → SIMPLE
resolver issue                   → STANDARD
alterar autenticação             → COMPLEX
reestruturar arquitetura         → DEEP
```

Cada classe define limites máximos iniciais:

- skills;
- contexto;
- referências;
- planning depth;
- subagents permitidos;
- verification depth.

O gate deve ser barato e determinístico sempre que possível.

**DoD**

- tarefas mecânicas não escalam automaticamente;
- classificação explicável;
- override explícito permitido;
- regressões de fan-out cobertas por testes.

---

### V1-08 — Router v3

> **Implementação:** entregue e default nesta linha V1. Router v3 pode ser inspecionado por `route explain`; Router v2 permanece somente como comparação/rollback explícito com `--router-version 2` durante a pré-release.

Substituir roteamento centrado em trigger por:

```text
Intent
  ↓
Complexity
  ↓
Capability
  ↓
Skill candidate
  ↓
Evidence/ranking
  ↓
Skill selected
```

O router deve considerar:

- intenção;
- stack;
- arquivos afetados;
- risco;
- contexto disponível;
- memória;
- `useWhen`;
- `doNotUseWhen`;
- capability necessária;
- custo/contexto da skill;
- downstream permitido.

`SKILL_CHAINS.json` passa a ser principalmente uma restrição de composição, não uma receita para eager loading.

Adicionar:

```bash
orquestrador-maestro route explain "<intent>"
```

Saída esperada:

```text
Intent: issue-resolution
Complexity: STANDARD

Selected:
  skill-issue-resolution

Potential downstream:
  systematic-debugging
  verification-before-completion

Rejected:
  multiagent — insufficient complexity
  architecture — no structural evidence

Estimated context: 4.2k tokens
```

**DoD**

- decisão explicável;
- negative routing;
- lazy loading;
- nenhum full-catalog prompt;
- benchmark contra Router v2.

---

### V1-09 — Content-addressed Context Cache

Cache de conhecimento derivado, invalidado pelo conteúdo.

Chave primária recomendada:

```text
repository identity
+ git blob SHA / content hash
+ analyzer version
```

Pode armazenar:

- resumo;
- símbolos;
- dependências;
- invariantes;
- relacionamentos;
- testes relacionados;
- tags semânticas;
- confiança;
- origem.

Regras:

- conteúdo não alterado → reutilizar;
- conteúdo alterado → invalidar ou gerar delta;
- segredo/raw output sensível não deve ser persistido;
- cache é derivado, nunca autoridade acima do código atual.

**DoD**

- cache hit mensurável;
- invalidação determinística;
- schema versionado;
- privacidade preservada;
- fallback correto sem cache.

---

### V1-10 — Repository Knowledge Map

Mapa estrutural do repositório usado para recuperar contexto sem varrer o projeto inteiro.

Modelo mínimo:

```text
Repository
├─ packages/modules
├─ domains
├─ entrypoints
├─ APIs
├─ database
├─ tests
├─ build
├─ CI
├─ infrastructure
├─ important symbols
└─ dependency edges
```

Deve ser incremental e barato.

Não deve exigir vector database obrigatória.

**DoD**

- atualização incremental;
- query por domínio/capability;
- ligação com Context Compiler;
- funciona em monorepo;
- degrada graciosamente em repos desconhecidos.

---

### V1-11 — Context Delta

Evitar reenvio de conhecimento já válido.

Modelo:

```text
Previous Context Pack
       +
Repository/Memory changes
       ↓
Context Delta
       ↓
New minimal Context Pack
```

Deve identificar:

- conhecimento ainda válido;
- conhecimento invalidado;
- arquivos alterados;
- novas decisões;
- nova evidência;
- novos requirements.

Quando a sessão do provider suporta continuidade, o Maestro fornece apenas delta/referências necessárias.

Quando não suporta, recompila um contexto compacto equivalente.

**DoD**

- redução mensurável de contexto repetido;
- resultado semanticamente suficiente;
- fallback completo quando o estado anterior não pode ser confiado.

---

### V1-12 — Skill Effectiveness & Routing Quality

Medir se as skills estão realmente ajudando.

Métricas iniciais:

- skill selected;
- skill actually used;
- routing confidence;
- context added;
- downstream skills;
- unused-after-load;
- validated outcome;
- retries;
- context escalations;
- token contribution quando disponível;
- latency contribution;
- routing correction/override.

Relatórios devem permitir responder:

- quais skills são carregadas e ignoradas?
- quais skills adicionam contexto demais?
- quais intents têm baixa precisão?
- quais chains quase nunca são necessárias?
- onde Router v3 supera Router v2?

**DoD**

- sem inventar token/custo ausente;
- métricas local-first;
- benchmark reprodutível;
- nenhuma decisão automática baseada apenas em correlação sem evidência suficiente.

## 5. Componentes transversais

### 5.1 Context Compiler

Os workstreams 08–11 convergem em um componente conceitual:

```text
Intent
 + Skill Context Requirements
 + Knowledge Map
 + Cache
 + Memory
 + Git State
 + Evidence
        ↓
Context Compiler
        ↓
Context Pack
```

Formato inicial de Context Pack:

```json
{
  "intent": {},
  "required": [],
  "supporting": [],
  "memory": [],
  "decisions": [],
  "tests": [],
  "excluded": [],
  "budget": {},
  "provenance": {},
  "fingerprint": ""
}
```

O Context Pack deve ser pequeno, explicável e reproduzível.

### 5.2 Skill Behavior Tests

Toda skill Maestro Core nova deve possuir:

```text
tests/
├─ should-route
├─ should-not-route
├─ context-requirements
├─ budget
├─ expected-output
└─ regression
```

Exemplo obrigatório:

```text
"faça um commit dessas alterações"

EXPECTED:
  git-workflow

FORBIDDEN:
  multiagent
  deep-interview
  architecture
  repo-health
```

## 5.3 Rollout, compatibilidade e rollback

Router v3 e Complexity Gate constituem o comportamento padrão da linha V1. Componentes ainda não concluídos, como o Context Compiler completo, não devem ser simulados como ativos antes de cumprirem seus próprios gates.

Rollout obrigatório:

```text
v3 ativo por padrão
  +
v2 somente para comparação/rollback explícito
      ↓
comparação de decisões/evidência sem execução duplicada
      ↓
remoção da dependência operacional de v2 antes da 1.0 estável
```

Regras:

- a comparação v2/v3 nunca executa uma segunda rota; apenas calcula/compara a decisão;
- registrar versão do router, fingerprint do registry e versão do compilador junto da decisão;
- manter mecanismo explícito de retorno ao Router v2 durante alpha/beta/RC apenas para rollback diagnosticável;
- caches devem ser namespaced por schema/analyzer version para permitir rollback sem reutilizar conhecimento incompatível;
- migração deve ser forward-compatible e documentar depreciação antes de remover contratos antigos;
- nenhum fallback pode esconder erro de contrato ou reduzir silenciosamente requisitos de segurança/verificação.

A permanência do Router v3 como default e a remoção do rollback v2 exigem evidência comparativa contra a baseline congelada.

## 5.4 Context Safety & Privacy

O Context Compiler trabalha com código e conhecimento potencialmente sensível. Segurança de coleta é requisito funcional.

Por padrão:

- respeitar `.gitignore`, ignores do Maestro e exclusões do projeto;
- não indexar `.env*`, credenciais, private keys, token stores ou arquivos reconhecidamente secretos sem opt-in explícito;
- evitar `node_modules`, vendor, build outputs, caches e artefatos gerados salvo necessidade comprovada;
- detectar binários e impor limite de tamanho antes de leitura/indexação;
- impedir fuga por symlink para fora do workspace autorizado;
- cachear conhecimento derivado, não dumps de terminal/provider nem conteúdo sensível bruto;
- registrar provenance/fingerprint suficiente para saber de onde um resumo veio;
- invalidar conhecimento quando conteúdo, analyzer, regras ou configuração relevante mudarem;
- nunca tratar resumo/cache como autoridade superior ao código atual;
- oferecer limpeza/expiração do cache local.

Testes negativos devem cobrir segredo, symlink escape, arquivo grande/binário e conteúdo stale.

## 5.5 Determinismo e Progressive Disclosure

Economia de tokens não pode depender apenas de resumir mais agressivamente.

A ordem preferencial é:

```text
metadata compacta
   ↓
roteamento determinístico barato
   ↓
skill selecionada
   ↓
SKILL.md
   ↓
referências específicas sob demanda
   ↓
contexto adicional somente por evidência
```

Regras:

- o catálogo completo nunca entra no prompt;
- intents MICRO/SIMPLE óbvios não devem exigir chamada de modelo apenas para escolher skill;
- matching explícito, negative routing e capability evidence precedem desempate semântico;
- skills `external/imported` sem routing V2 confiável permanecem explicit-only; presença no catálogo público nunca autoriza auto-routing;
- classificação semântica/LLM é fallback para ambiguidade, não primeiro passo;
- mesmo intent + mesmo estado do repo + mesma configuração deve produzir decisão reproduzível sempre que o caminho for determinístico;
- cada Route Decision deve registrar `whySelected`, `whyRejected`, confidence e orçamento;
- cada Context Pack deve registrar fingerprint, provenance e motivos de inclusão/exclusão.

## 5.6 Developer Capability Coverage

A V1 não deve medir qualidade do catálogo pela quantidade de skills.

Manter uma matriz de cobertura por trabalho real do desenvolvedor:

| Capacidade | Estado pré-V1 | V1 |
| --- | --- | --- |
| Git / branch / commit / conflito | gap | `skill-git-workflow` |
| Issue → correção validada | gap | `skill-issue-resolution` |
| Debug / causa raiz | existente | `skill-systematic-debugging` |
| Estratégia de testes | parcial | `skill-test-engineering` |
| Web/E2E | existente | `skill-webapp-testing` |
| CI/pipeline | gap | `skill-ci-troubleshooting` |
| PR/review/readiness | parcial | `skill-pr-lifecycle` + review existente |
| Banco/migrations | existente | `skill-database-migrations` |
| Dependências | existente | `skill-dependency-upgrade` |
| Release | existente | `skill-release-engineering` |
| Segurança | existente | security review / threat modeling / scans |
| Arquitetura/repo health | existente | repo-health / architecture / ADR |
| Frontend/UX | existente | frontend-excellence + guardrails |
| Documentação | existente | deep-wiki / ADR |
| Refactoring incremental | cobertura parcial | avaliar após baseline |
| API design/contracts | cobertura parcial | avaliar após baseline |
| Performance/profiling | gap | candidato 1.x |
| Observabilidade de aplicação | parcial | candidato 1.x |
| Docker/containers | cobertura parcial | candidato 1.x |
| Kubernetes/operação | gap | candidato 1.x |
| Build/tooling/dev environment | parcial | candidato 1.x |
| Modernização de legado | parcial | candidato 1.x |

Uma nova skill só deve ser criada quando:

1. existir um gap demonstrável na matriz;
2. nenhuma skill existente puder cobrir o fluxo sem ficar genérica demais;
3. houver casos `should-route` e `should-not-route`;
4. contexto necessário e evidência de conclusão estiverem definidos.

Assim a V1 cobre primeiro o loop diário de maior frequência e mantém expansão 1.x guiada por gaps, não por acumulação de skills.

## 5.7 Contratos públicos da 1.0

A tag `1.0.0` não significa congelar todos os detalhes internos.

Antes do RC, declarar explicitamente quais superfícies recebem garantia SemVer. No mínimo avaliar:

- Skill Contract V2;
- formato público de Route Decision / `route explain`;
- Context Pack quando exposto a clientes/plugins;
- CLI documentada;
- campos públicos de telemetria/evidência usados por integrações.

Formatos internos de cache e índices podem evoluir se forem versionados, migráveis/invalidados automaticamente e não forem apresentados como API estável.

## 5.8 Estado atual do Foundation

No `1.0.0-alpha.1`:

- manifesto canônico: V3;
- Skill Contract: V2;
- skills Maestro canônicas: 53;
- Maestro Core: 15;
- Maestro Domain: 38;
- `skill-engineering-quality`: Core multi-stack para discovery e aplicação por delta de formatter, lint/static analysis, typecheck/compile, testes, build e CI;
- skills Maestro não nativas: 0;
- IDs públicos conflitantes: 0;
- skills externas públicas: permanecem fora do contrato canônico e explicit-only quando não houver routing confiável;
- `skills:contract-audit:strict`: configurado como gate do workflow de testes.

O próximo trabalho funcional deve consumir esse contrato; não criar nova camada de compatibilidade canônica.

## 6. Sequenciamento

### Milestone A — Foundation / Skill Contract

Inclui:

- V1-01;
- schema V2;
- negative routing;
- context requirements;
- migração breaking do catálogo Maestro para manifesto V3 / Skill Contract V2;
- skill behavior test harness.

**Bloqueia:** Router v3 e novas skills Core.

### Milestone B — Developer Core

Inclui:

- V1-02 Git Workflow;
- V1-03 Issue Resolution;
- V1-04 PR Lifecycle;
- V1-05 CI Troubleshooting;
- V1-06 Test Engineering.

Objetivo: cobrir o ciclo diário antes de ampliar especializações.

### Milestone C — Routing Intelligence

Inclui:

- V1-07 Complexity Gate;
- V1-08 Router v3.

Objetivo: evitar over-orchestration e escolher capacidade com menor custo cognitivo.

### Milestone D — Context Intelligence

Inclui:

- V1-09 Context Cache;
- V1-10 Repository Knowledge Map;
- V1-11 Context Delta;
- Context Compiler.

Objetivo: parar de redescobrir/retransmitir conhecimento válido.

### Milestone E — Learning & V1 Gate

Inclui:

- V1-12 Skill Effectiveness;
- comparação Router v2 vs Router v3;
- comparação contexto cold vs warm;
- regressão de qualidade;
- documentação/migração;
- release candidates.

## 7. Dependências principais

```text
V1-01
 ├─► V1-02..06
 └─► V1-08

V1-07 ─► V1-08

V1-10 ─► V1-09/11
V1-09 ─► V1-11

V1-08 + V1-09 + V1-10 + V1-11
             ↓
       Context Compiler

todos
 ↓
V1-12
```

## 8. Critérios quantitativos para a V1

Os números finais devem ser definidos após baseline, mas a V1 precisa demonstrar:

1. nenhuma regressão de Validated Outcome contra a linha 0.4.x;
2. redução mensurável de contexto repetido em tarefas warm;
3. redução de eager skill loading;
4. operações MICRO sem fan-out;
5. roteamento explicável e testável;
6. zero conflito de identidade no catálogo canônico;
7. novas skills Core cobrindo Git/Issue/PR/CI/Test;
8. fallback funcional quando cache/mapa/memória estão ausentes;
9. compatibilidade Windows/Linux/macOS;
10. migração documentada de 0.4.x para 1.0.

Claims públicos de economia só podem existir com benchmark e Evidence válidos.

## 9. Estratégia de implementação

Cada workstream deve seguir:

```text
SPEC
  ↓
contract/schema
  ↓
tests
  ↓
implementation
  ↓
integration
  ↓
benchmark
  ↓
documentation
```

Evitar grandes PRs consolidados como o #23.

Preferir PRs verticais pequenos com contratos claros.

Sugestão:

- PR A1: Skill Schema V2 + Registry;
- PR A2: migração V3 + remoção do legado canônico;
- PR A3: skill behavior test harness;
- PR B1..B5: uma skill Developer Core por PR;
- PR C1: Complexity Gate;
- PR C2: Router v3;
- PR D1: Repository Knowledge Map;
- PR D2: Context Cache;
- PR D3: Context Delta + Context Compiler;
- PR E1: effectiveness telemetry;
- PR E2: benchmark + migration docs + V1 release gates.

## 10. Release Gate 1.0.0

A tag `1.0.0` só é permitida quando:

- todos os 12 workstreams obrigatórios estiverem completos ou explicitamente retirados do escopo;
- schema de Skill V2 estiver estável;
- Router v3 estiver default;
- Router v2 existir apenas como shadow/rollback de pré-release; a 1.0 não promete compatibilidade de contrato com a linha 0.x;
- Context Pack tiver schema estável;
- cache e mapa tiverem invalidação determinística;
- Developer Core tiver testes de roteamento;
- benchmark cold/warm estiver reproduzível;
- docs estiverem alinhadas ao produto real;
- nenhuma capability planejada estiver sendo vendida como stable;
- CI suportado estiver verde em Windows/Linux/macOS;
- release candidate tiver sido exercitado antes da tag estável;
- Router v3 tiver passado por shadow comparison antes de virar default;
- existir rollback explícito para a linha anterior durante pré-release;
- Context Compiler tiver testes negativos de segredo, symlink escape, binários/arquivos grandes e cache stale;
- progressive disclosure estiver comprovado por teste (catálogo completo não entra no prompt);
- a matriz de Developer Capability Coverage estiver atualizada;
- as superfícies públicas cobertas por SemVer estiverem explicitamente documentadas.

## 11. Resultado esperado

A V1 não deve ser definida por quantidade de features.

Ela deve ser reconhecível por este comportamento:

> O desenvolvedor descreve o trabalho uma vez. O Maestro entende o tipo de tarefa, escolhe somente as capacidades necessárias, reutiliza conhecimento ainda válido, carrega o menor contexto suficiente, evita fan-out desnecessário e deixa o provider executar com mais precisão e menos desperdício.
