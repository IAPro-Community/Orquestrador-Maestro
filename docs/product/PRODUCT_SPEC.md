# Maestro — Especificação do Produto (PRODUCT_SPEC)

> Fonte: `docs/product/CAPABILITY_MATRIX.json` + código. Código e testes vencem
> documentação.

## 1. Identidade

**O que é.** O Orquestrador Maestro é um **control plane local-first para
desenvolvimento de software com agentes de IA**. Ele organiza regras, contexto,
skills, planejamento, execução, verificação e evidência para que diferentes
ferramentas de IA sigam o mesmo processo.

**O que não é.**

- Não é um LLM, não hospeda agentes, não executa modelos.
- Não substitui Codex, Claude Code, OpenCode, Cursor, Gemini ou outras ferramentas.
- Não é IDE, chatbot, cloud SaaS obrigatório nem substituto do CLI favorito.
- Não é controle financeiro (FinOps): expõe observabilidade de uso/tokens,
  não gestão financeira.

**Problema.** Cada ferramenta de IA tem seu próprio contrato, contexto e
comportamento; trocar de ferramenta perde padrão, memória e verificabilidade.

**Solução.** Uma camada comum local-first:

```text
entender → recuperar contexto → selecionar capacidades → planejar
→ executar → verificar → validar o outcome → registrar evidência → continuar depois
```

**Princípios.** Local-first; privacidade por construção (sanitização e
efemeridade); evidência antes de claim; menor contexto suficiente; zero
dependência obrigatória nova; compatibilidade Node 20+ / Windows / Linux / macOS.

## 2. Arquitetura conceitual

```text
ORQUESTRADOR MAESTRO
├── Maestro Protocol — rules, governance, project context, DEV memory,
│   episodic memory, skills, routing, profiles, handoff
├── Maestro Runtime — missions, tasks, task graph, planning, providers,
│   Resolution Engine, runs, workspaces, worktrees, verification,
│   artifacts, telemetry, evidence
└── Maestro Cockpit — projects, missions, task graph, agents, terminals,
    skills, attention, notifications, inspection
```

- **Protocol** é o contrato (instalação, regras, memória, skills). Funciona sem
  o Runtime.
- **Runtime** é o executor local opcional (providers reais:
  `codex`, `claude`, `opencode`, `agy`).

## 3. Entidades

| Entidade | Significado | Onde vive |
|---|---|---|
| Project | Raiz identificada deterministicamente pelo caminho | Runtime + DEV/ |
| Mission | Intenção de trabalho decomposta em tarefas | Runtime |
| Task / TaskGraph | Unidade de trabalho e seu grafo de dependências | Runtime planner |
| Run / Step / Execution | Execução rastreável de Task via provider | RunStore JSON v1 |
| RunSubmission / ExecutableManifest / ApprovalReceipt | Admissão durável de um plano aprovado, com manifesto imutável, recibo autoverificável e ACK idempotente | RunStore (`runSubmissions`, `executableManifests`, `approvalReceipts`) |
| GoalLoopDecision | Decisão auditável pós-terminal (`PASS`, `CORRECTIVE_REVIEW`, `BLOCKED_NEEDS_USER`) sem re-dispatch automático | RunStore (`goalLoopDecisions`) |
| Provider | Adapter real de execução (`detect/capabilities/execute`) | `runtime/providers/` |
| Agent | Processo de ferramenta executado pelo provider | efêmero |
| Skill | Capacidade empacotada (`SKILL.md` + manifesto) | `orquestrador/skills` (catálogo canônico; contagem derivada do manifesto) |
| Workspace / Worktree | Isolamento (`shared` ou git worktree sob `.maestro/`) | `runtime/workspaces/` |
| Artifact | Saída registrada do run | RunStore |
| Verification | Checagens `lint/typecheck/test/build` (safe-list) | `runtime/verification/` |
| Resolution Contract / Outcome | Política, estratégia, budget, Evidence, DoD e estado de resolução de uma Task | `runtime/resolution/` + `run.metadata.resolution` |
| Evidence | Evidência produzida pelo Runtime e evidência imutável de benchmark | RunStore + `benchmark-harness/` |
| Proof Bundle | Projeção auditável de Task/Mission sobre Runs, Verification, Artifacts, Evidence e outcomes | `runtime/resolution/evidence/proof-bundle.js` |
| Memory | Episódica JSONL redigida + DEV curada por humanos | `~/.orquestrador/memory` + `DEV/` |
| DEV | Memória operacional canônica do projeto | `DEV/` (gitignored neste espelho) |
| Governance | Portões de mudança, compatibilidade, revisão independente | `runtime/governance/` |
| Interaction/Execution Profile | Como a IA interage / quantas skills carrega | `INTERACTION_PROFILES.json` / `SKILL_EXECUTION_PROFILES.json` |
| Bridge | API JSON-RPC v1 sobre stdio | `runtime/bridge/` |

## 4. Fluxo

```text
Intent → Mission → Context → Skills → Plan → Task Graph
→ Resolution Contract → Durable Admission → Worker/DAG
→ Execution → Verification → Review
→ Definition of Done → Validated Outcome → Evidence → Memory/Handoff
```

Troca de ferramenta: sobrevivem regras, contexto, skills, memória DEV/episódica,
runs e evidência. Dependem do provider: execução, sessão, permissões e streaming.

## 5. Capabilities comprovadas

Ver `CAPABILITY_MATRIX.json` (`status: stable`, `publicClaimAllowed: true`):
protocolo, contexto progressivo, DEV, memória episódica, roteamento de 75 skills públicas (52 canônicas),
governança, 4 providers, runs/artefatos, verificação, worktrees, observação
Git, observabilidade de uso, telemetria opt-in, benchmark com evidence gate,
Maestro Resolution Engine, Validated Outcome, Proof Bundle, provider handoff
e Bridge v1 por stdio.

### Em avaliação (experimental, sem claim público)

- **Admissão durável de Runs:** `runs.submit` persiste manifesto imutável,
  recibo autoverificável e ACK `PENDING_WORKER`; um worker Maestro-owned executa
  o DAG em ordem topológica, com fencing e um Run por tarefa.
- **Goal Loop:** avalia `COMPLETED`, `FAILED`, `BLOCKED` e `TIMED_OUT`. `PASS`
  exige Resolution validada e evidência vinculada; correções permanecem
  bloqueadas sem custo real medido e nunca são re-despachadas automaticamente.
- **Observação de submissões:** `runs.submissions.list/get/poll/cancel` com
  escopo de projeto, redaction e `usage` medido opcional.

O caminho tem testes automatizados e E2E com provider shim; a suíte completa
passou na CI pública para Linux, Windows e macOS. A lista vigente de limites
está em [Execução durável de Runs](../architecture/DURABLE_RUN_ADMISSION.md).

## 6. Limitações explícitas

- Apenas os providers Runtime listados em `CAPABILITY_MATRIX.json`; demais ferramentas são contrato/integração, não execução.
- `agy` ≠ Antigravity IDE. Freebuff sem headless estável (uso interativo).
- Sem merge automático de worktree; limpeza manual.
- Telemetria remota exige `telemetry enable` + endpoint + chave; sem isso nada sai.
- Benchmark: claim público exige N≥20 pareados e condições de elegibilidade.
- Resolution `enforce` não é modo normal de CLI: permanece bloqueado até evidência hard-validada, policy-bound e autorização explícita. `shadow` e `advisory` não alteram silenciosamente a seleção normal de contexto.
- Bridge suportado na V1 usa somente JSON-RPC v1 por stdio; daemon/socket e protocolo visual v2 não fazem parte da release.
- Execução durável (`runs.submit` + worker) é experimental: o E2E usa provider shim, não homologa CLIs reais e ainda não cobre macOS arm64, restart durante execução nem dois clientes em hosts distintos. Não habilitar autonomia por padrão. Limites completos em [Execução durável de Runs](../architecture/DURABLE_RUN_ADMISSION.md).
