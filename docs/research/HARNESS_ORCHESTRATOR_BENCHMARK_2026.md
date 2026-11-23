
# Benchmark arquitetural — Harness Orchestrator (#67 / próxima evolução)

**Auditoria executada:** 2026-11-22 (America/Sao_Paulo). **Base Maestro:** branch `v1`, HEAD auditado `dcf6631ddfb29ca9caba24c7ffa7ea73294c4cb3`.  
**Metodologia:** acesso direto à árvore Git, arquivos de implementação, exemplos de testes e licença declarada pela API GitHub. Nenhum dos projetos externos foi instalado ou executado neste ambiente. Leitura de código não comprova homologação em produção. `ADAPT` significa absorver desenho/contrato, **não copiar código**.

## Matriz de decisões

| Projeto | Licença declarada | Problema realmente resolvido; evidência de implementação | Limite/risco de adoção | Decisão |
| --- | --- | --- | --- | --- |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | MIT | Scaffolding multiagente de constituição, especificação, plano e tarefas. `src/specify_cli/command_init.py` controla inicialização e prompts não interativos; `templates/spec-template.md` exige cenários independentes de teste; testes presentes em `tests/`. | Templates e prompts não são prova de resultado nem controle de Run. Dependência CLI Python e múltiplas convenções não devem substituir Planner/IntentSpec existentes. | **ADAPT** organização curta de Spec e critérios, sem dependência |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | MIT | Grafo configurável de artefatos e deltas de Spec. `src/core/artifact-graph/state.ts` usa existência de arquivos para determinar artefatos concluídos; `test/core/artifact-graph/workflow.integration.test.ts` cobre transições/dependências. | `artifact complete` nesse contexto **não** significa funcionalidade verificada; o runtime do Maestro já tem TaskGraph/Plan revisão. Importar o workflow criaria outra fonte de verdade. | **ADAPT** relação requisito → Spec → tarefas, sem segundo store |
| [Metaswarm](https://github.com/dsifry/metaswarm) | MIT | Harness de agentes/skills/rubricas e revisão. `lib/review-rule.js` implementa decisão determinística de iteração com cap=10; `tests/lib/review-rule.test.mjs` verifica convergência/divergência e insumos inválidos. | Orquestração de especialistas e muitos entrypoints colidiriam com Router, Skills, Mission e worker. As alegações de eficácia do README não substituem E2E reproduzível no Maestro. | **ADAPT** rubricas e stop conditions; **REJECT** runtime completo |
| [OpenAI Symphony](https://github.com/openai/symphony) | Apache-2.0 | Supervisor de issues e workspaces isolados. `elixir/lib/symphony_elixir/orchestrator.ex` coordena polling/retries/tracker; `workflow_store.ex` retém o último workflow válido após falha de reload; `workspace.ex` cria workspaces por issue. | GenServer, tracker, scheduler e workers formariam outro control plane; stack Elixir adiciona custo operacional e scope desnecessários. | **REFERENCE_ONLY** recovery e last-known-good |
| [Microsoft Agensh](https://github.com/microsoft/Agensh) | MIT | Harness distribuído para equipes de agentes. `agensh/quality.py` gera gates CI e políticas de caminhos protegidos; `tests/smoke/check_gate.py` exercita gate em stack Gitea. | Envolve serviço de board, networking, runners e integração de revisão/merge; não serve como dependência leve de CLI standalone. | **REFERENCE_ONLY** políticas executáveis e testáveis |
| [MartinLoop](https://github.com/Keesan12/martin-loop) | Apache-2.0 | Run receipts, contratos de contexto e detecção heurística de testes circulares. `packages/core/src/test-integrity.ts` examina importações/testes gerados; `context-chain-gate.ts` e testes demonstram checks de integridade. | Heurísticas não provam correção funcional. Seu teste de gate de contexto explicita que extrapolação de USD pode ser apenas comentário: não copiar como enforcement financeiro. Contratos e stores próprios duplicariam os do Maestro. | **ADAPT** integridade de testes/evidence receipts |
| [Ralph Orchestrator](https://github.com/mikeyobrien/ralph-orchestrator) | MIT | Loop/roles em Rust e gates de eventos. `crates/ralph-core/src/gates.rs` verifica campos, commit e comandos, com executor injetável e testes de gate/event loop. | Um segundo loop e cliente runtime duplicariam Supervisor e Goal policy; instalação Rust/MCP/CLI aumenta superfície de manutenção. | **ADAPT** gates ordenados e explícitos; **REJECT** motor |
| [Vercel Ralph Loop Agent](https://github.com/vercel-labs/ralph-loop-agent) | Apache-2.0 | Biblioteca TypeScript de outer-loop sobre AI SDK. `ralph-loop-agent.ts` itera chamadas; `ralph-loop-agent-evaluator.ts` define `verifyCompletion`; há `ralph-loop-agent.test.ts`. | `verifyCompletion.complete` é resposta de callback: se callback confiar no agente, não é prova independente. Nova dependência AI SDK e novo loop colidiriam com worker e adapters atuais. | **REFERENCE_ONLY** interface de conclusão; **REJECT** dependência |
| [OpenCode Goal Plugin](https://github.com/william-ricchiuti/OpenCode-goal-plugin) | MIT | Goal por sessão com persistência, lease, auditor e limites. `src/goal-plugin.js` contém estado/receipts/hooks; `test/goal-plugin.test.js` tem cenários amplos de estado e verificação. Projeto declara maintenance mode com Goal nativo em OpenCode 2.2.1+. | Instalar plugin mais Goal nativo ou Goal gerenciado pode produzir múltiplos owners e duplicar ledger. Evidência de plugin não comprova suporte headless do adapter Maestro. | **REFERENCE_ONLY** testes de posse de sessão e recuperação |
| [Orkestra](https://github.com/andyyaro/orkestra) | Apache-2.0 | Kernel de política separado do diretor; `src/orkestra/policy/engine.py` nega push/escrita fora do escopo; `src/orkestra/verify/binding.py` demonstra que um teste pode importar código do checkout errado; `tests/e2e/test_gate_binding_wiring.py` cobre gate vacuamente verde. | Reproduzir framework Python e kernel/scheduler duplicaria Maestro; teste de mutação custa execuções adicionais e deve ser habilitado por risco. Repositório pequeno: maturidade operacional ainda requer validação. | **ADAPT** vínculo do verificador à árvore e políticas determinísticas |

## Comparação por responsabilidade

- **Engineering Context:** Spec Kit e OpenSpec reforçam contexto de projeto e rastreabilidade; MartinLoop destaca provenance/receipt. O Maestro já tem `context-brief`, `ContextEngine`, `ContextBudget` e memória. Melhorar a descoberta de componentes e referências; não adotar novo context store.
- **Engineering Specification:** OpenSpec oferece bons contratos de dependências entre artefatos, mas seu `detectCompleted` verifica a presença de arquivos; portanto o Maestro deve separar Spec escrita, critério verificado e resolução validada.
- **Engineering Governance:** Agensh e Orkestra demonstram políticas executáveis antes de dispatch/merge. Maestro deve aplicar checks determinísticos a versões e escopo, com `RunStore` como autoridade; prompts são somente instruções, nunca autorização.
- **Engineering Execution:** Symphony, Ralph, Metaswarm, MartinLoop e Orkestra mantêm loops próprios. Integrá-los como motores seria uma regressão de manutenção. Os adapters existentes são a fronteira correta: Native Goal **apenas onde controlável**, ou único worker Maestro.
- **Engineering Verification:** O teste de binding do Orkestra e a integridade heurística MartinLoop expõem o maior gap: exit code zero não prova que a implementação correta foi testada. A solução é ancorar verificador, fonte e artefato a uma revisão e registrar drift.
- **Engineering Learning:** reutilizar a memória já existente; promoção precisa de evidência estável e namespace, não de resumos autoafirmados do modelo.

## Decisão sobre bibliotecas

**ADOPT: nenhuma biblioteca nova neste incremento.** As ideias são úteis, mas não há aqui demonstração de benefício líquido de dependência adicional, de compatibilidade com Node >=20.19/Windows/macOS, nem de ausência de segundo owner. `ADAPT` é revisão de contratos e pequenas extensões locais; licenças permitem estudo e uso sob seus termos, mas não implicam aprovação para copiar arquivos nem substituem revisão jurídica se houver incorporação.

## Matriz de esforço e duplicação

| Alternativa | Duplicação | Dependência/custo | Decisão |
| --- | --- | --- | --- |
| Importar um orquestrador inteiro | Alto: scheduler, estado, retries, providers, event logs | Alto: dois loops e atualização de terceiros | Não |
| Usar OpenSpec como segundo repositório de especificações | Médio: IntentSpec, TaskGraph, revisão/receipts | Médio: migração e sincronização | Não |
| Adotar um template curto e versionado em artefatos já existentes | Baixo | Baixo | Sim, fase P1 |
| Preflight de vinculação/verificação e auditoria exata | Baixo: estende verificações/RunStore | Baixo a médio, por stack | Sim, P0 |
| Integração nativa de provider comprovadamente controlável | Baixo quando usa adapter existente | Médio, condicionado a versão/SDK | Spike e testes reais primeiro |

## Evidência reproduzível de leitura de código

Árvores Git consultadas em `main` (são **tree SHAs**, não homologação de versões publicadas):  
Spec Kit `a4d571229e164e440f8950cac034607bae7b7518`; OpenSpec `0c737dc1b543249b38b0f4716816fcf493d894dd`; Metaswarm `4bbb10abd301b9ec9d63371e296049cbc6043baa`; Symphony `be10a1b79df723d6d7612b5651c8522704dafb2e`; Agensh `2dae4e14a653da48549fd9aa093f834841475d6c`; MartinLoop `4a481931972d061669dea9a2694279f11b9544fa`; Ralph Orchestrator `7d36cc76495e2145699d0191d35414f0e9d7a801`; Vercel Ralph `8a37af8390c7bd6fac81f746776b52ce6d5001b4`; OpenCode plugin `1ae8144a503dfdc8574694cd7ad9e4b5554280d2`; Orkestra `68ef18b939d62b703334746ea94e5ecb7bc3cae0`.

**Limites:** não houve instalação, execução de testes externos, medição de desempenho ou auditoria aprofundada de todas as dependências transitivas. Nenhum resultado de marketing foi transformado em prova de confiabilidade. Recomendações são arquiteturais, não certificação de produção.
