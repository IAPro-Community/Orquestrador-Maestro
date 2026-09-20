# Maestro — Especificação do Produto (PRODUCT_SPEC)

> Fonte: `docs/product/CAPABILITY_MATRIX.json` + código. Código e testes vencem
> documentação. Revisão da base: `48b4065` (pacote `0.4.2`).

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
→ executar → verificar → registrar evidência → continuar depois
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
│   runs, workspaces, worktrees, verification, artifacts, telemetry, evidence
└── Maestro Cockpit — projects, missions, task graph, agents, terminals,
    skills, attention, notifications, inspection
```

- **Protocol** é o contrato (instalação, regras, memória, skills). Funciona sem
  o Runtime.
- **Runtime** é o executor local opcional (4 providers reais:
  `codex`, `claude`, `opencode`, `agy`).
- **Cockpit** é uma superfície (TUI + cliente VS Code opcional), não o produto.

## 3. Entidades

| Entidade | Significado | Onde vive |
|---|---|---|
| Project | Raiz identificada deterministicamente pelo caminho | Runtime + DEV/ |
| Mission | Intenção de trabalho decomposta em tarefas | Runtime |
| Task / TaskGraph | Unidade de trabalho e seu grafo de dependências | Runtime planner |
| Run / Step / Execution | Execução rastreável de Task via provider | RunStore JSON v1 |
| Provider | Adapter real de execução (`detect/capabilities/execute`) | `runtime/providers/` |
| Agent | Processo de ferramenta executado pelo provider | efêmero |
| Skill | Capacidade empacotada (`SKILL.md` + manifesto) | `orquestrador/skills` (51) |
| Workspace / Worktree | Isolamento (`shared` ou git worktree sob `.maestro/`) | `runtime/workspaces/` |
| Artifact | Saída registrada do run | RunStore |
| Verification | Checagens `lint/typecheck/test/build` (safe-list) | `runtime/verification/` |
| Evidence | Pacote imutável do benchmark (`run-report.json` + outputs) | `benchmark-harness/` |
| Memory | Episódica JSONL redigida + DEV curada por humanos | `~/.orquestrador-maestro/memory` + `DEV/` |
| DEV | Memória operacional canônica do projeto | `DEV/` (gitignored neste espelho) |
| Governance | Portões de mudança, compatibilidade, revisão independente | `runtime/governance/` |
| Interaction/Execution Profile | Como a IA interage / quantas skills carrega | `INTERACTION_PROFILES.json` / `SKILL_EXECUTION_PROFILES.json` |
| Bridge | API JSON-RPC v1 sobre stdio + eventos v2 | `runtime/bridge/` + `runtime/protocol/` |

## 4. Fluxo

```text
Intent → Mission → Context → Skills → Plan → Task Graph
→ Execution → Verification → Evidence → Memory/Handoff
```

Troca de ferramenta: sobrevivem regras, contexto, skills, memória DEV/episódica,
runs e evidência. Dependem do provider: execução, sessão, permissões e streaming.

## 5. Capabilities comprovadas

Ver `CAPABILITY_MATRIX.json` (`status: stable`, `publicClaimAllowed: true`):
protocolo, contexto progressivo, DEV, memória episódica, roteamento de 51 skills,
governança, 4 providers, runs/artefatos, verificação, worktrees, PTY, observação
Git, observabilidade de uso, telemetria opt-in, benchmark com evidence gate,
bridge, Cockpit TUI, cliente VS Code.

## 6. Limitações explícitas

- Só 4 runtime providers; demais ferramentas são contrato/integração, não execução.
- `agy` ≠ Antigravity IDE. Freebuff sem headless estável (uso interativo).
- Sem merge automático de worktree; limpeza manual.
- `node-pty` opcional (`PTY_UNAVAILABLE` sem ele); tmux exige binário.
- Telemetria remota exige `telemetry enable` + endpoint + chave; sem isso nada sai.
- Benchmark: claim público exige N≥20 pareados e condições de elegibilidade.
- Bridge doc cobre v1; métodos v2 existem no código e ainda não estão na doc da API.
