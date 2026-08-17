# Prompt — Fechamento do Milestone M3 (Semantic Planning)

> **Data:** 2026-08-14
> **Autor:** Orquestrador (análise pós-implementação)
> **Objetivo:** Concluir formalmente o M3 do Orquestrador Maestro, zerando todas as pendências encontradas, e deixar o repositório pronto para publicação (espelho público sanitizado).
> **Uso:** Cole este prompt em um agente (Codex/OpenCode/Claude) para executar o fechamento. Siga a ordem das pendências, verifique cada item e não commite/publique sem autorização explícita do maestro.

---

## 1. Papel e regras de execução

- Você é o `orquestrador`; o usuário é o `maestro`.
- Leia antes: `<home>/.orquestrador/rules.md`, `maestro.md`, `AGENTS.md` do projeto e `DEV/INDEX.md` -> `DEV/HANDOFF.md` -> `DEV/CONTEXT.md` -> `DEV/SPECS/ACTIVE.md` (substitua `<home>` pelo home real do usuário, sem nunca publicá-lo).
- **Não** auto-commite nem auto-push; apresente os diffs e os comandos propostos para o maestro aprovar.
- **Não** inclua dados pessoais, caminhos reais de usuário, tokens ou conteúdo privado (repo é espelho público; rode `scripts/validate-public.ps1` antes de subir).
- Verifique antes de declarar conclusão (`DEV/VERIFY.md`, `npm test`, gates).

---

## 2. O que já está desenvolvido e verificado (a título de comparação)

### 2.1 M3 — Semantic Planning: entregue 12/12 tasks

| Task | Entregável | Commit |
|---|---|---|
| 1 | DAG primitives + dependências canônicas (`dag-utils.js`) | 4f11cfb / a162170 |
| 2 | Contratos `SemanticTask` / `TaskGraphProposal` + mapeamento p/ Core | d6a8bcc / 46a5887 |
| 3–4 | `GraphValidator` (estrutura, DAG, assumptions, contexto, missão) | eeea5a3 / 0421074 / 9b77ed8 / 0e78b3a |
| 5 | `LegacyExecutionProjection` (target explícito, zero default silencioso) | 353277e |
| 6 | `DeterministicFallbackPlanner` (contexto-grounded, provenance) | c6bdb7b |
| 7 | `SemanticPlanner` (plannerTarget explícito + `localOnly`) | bf7a44a / bacb660 |
| 8 | `PlanApprovalGate` (HUMAN_REVIEW vs USER_AUTO_POLICY) | 96913de / 4f5af62 |
| 9 | Façade `task-decomposer` + `task-formatter` | 3aab268 / 442e41c |
| 10 | CLI `go` com MissionBrief aprovado + fluxo real de revisão humana | e679cf3 |
| 11 | Cenários de aceite E2E + boundary spy do executor | 35468af |
| 12 | Caracterização `LaneExecutor` + `JsonFileRunStore` (runtime UNCHANGED) | 944f500 |

Detalhe dos 16 cenários obrigatórios da spec (`docs/superpowers/specs/2026-08-13-semantic-planning-design.md` §5) e os testes que os cobrem: **todos os 16 cobertos** — `task-graph-proposal.test.js` (1, 3, 10, 11), `legacy-execution-projection.test.js` (2), `graph-validator-context.test.js` (4, 5, 6), `graph-validator.test.js` (13, 14), `deterministic-fallback-planner.test.js` (7), `plan-approval-gate.test.js` (8, 9), `dag-utils.test.js` (12), `m3-acceptance-scenarios.test.js` (15), `legacy-compatibility.test.js` (16).

### 2.2 Estado dos gates (medido em 2026-08-14)

| Gate | Resultado |
|---|---|
| `npm test` | 185 pass / 0 fail / 1 skip intencional |
| `check-dev-gates --project-path . --strict` | passed (WorklogEntries 11/12) |
| `node --check` (bin + planner) | OK |
| `npm pack --dry-run` | OK (514 arquivos) |
| `DEV/M3_LEDGER.md` | 12/12 COMPLETE/PASS |
| Baseline legado | preservado (teste de compatibilidade verde) |

### 2.3 Escopo M3 oficialmente fechado

- **Dentro:** SemanticPlanner, GraphValidator, PlanApprovalGate, LegacyExecutionProjection, fallback determinístico, provenance, caracterização runtime.
- **Fora (M4+):** ModelRouter/rota de modelos, bidding dinâmico, self-healing, coletor de evidências, DAG editor na TUI, scheduler global.

---

## 3. Pendências encontradas (completas, por severidade)

### P1 — CRÍTICA: runtime não versionado no Git (clone quebra)

- Apenas **11 de 82** arquivos de `runtime/` estão rastreados (`git ls-files runtime`): somente `runtime/core/entities.js` e 10 arquivos do planner M3.
- **Untracked** (~71 arquivos): `runtime/application/`, `runtime/bridge/`, `runtime/context/`, `runtime/git/`, `runtime/inspector/`, `runtime/providers/`, `runtime/skills/`, `runtime/store/`, `runtime/terminals/`, `runtime/tui/`, `runtime/verification/`, `runtime/workflows/`, `runtime/workspaces/`, `runtime/index.js`, `runtime/core/index.js`, `runtime/core/validation.js`, `runtime/profiles/`, e módulos M1/M2 do planner (`intent-*.js`, `proposal-*.js`, `mission-brief-builder.js`, `model-router.js`, `lane-executor.js`, `readiness-evaluator.js`, `recommendation-manager.js`, `ai-interviewer.js`, `context-compactor.js`, `context-preflight.js`, `dynamic-interviewer.js`).
- **15 testes untracked** (M1/M2): `ai-interviewer-facade.test.js`, `ai-interviewer.test.js`, `context-engine.test.js`, `intent-question.test.js`, `intent-spec.test.js`, `legacy-compatibility.test.js`, `m2-final-gate.test.js`, `mission-brief-builder.test.js`, `model-router.test.js`, `proposal-parser.test.js`, `proposal-validator.test.js`, `readiness-evaluator.test.js`, `recommendation-manager.test.js`, `runtime-suite.test.js`, `task-formatter.test.js`.
- **Consequência:** um clone do repo hoje não executa `npm test` nem a CLI (`bin/` referencia `runtime/index.js`, untracked). A caracterização M3 e a compatibilidade legada ficam inválidas fora da máquina local.

**O que fazer:**
1. Revisar `git status` completo e **confirmar que nenhum arquivo untracked contém dados pessoais/tokens/caminhos de usuário** antes de `git add` (especialmente `output/` e `extensions/`).
2. `git add runtime/ tests/` e revisar o diff staged (`git diff --cached --stat`).
3. Apresentar ao maestro o conjunto de commits proposto (sugestão: 1 commit "feat(runtime): versionar runtime M1–M2 e suite de testes de compatibilidade", separado do fechamento M3) e **aguardar autorização**.

### P2 — ALTA: `main` divergido do `origin/main` (ahead 19 / behind 8)

- Merge-base: `7212c46`. No origin existem 8 commits não integrados localmente, incluindo **release 0.1.20** e **workflow de release npm automatizado** (`460c094`, `e145fb5`, `2540806`, `bd4f0b2`, `a416661`, `7cd5e1e`, `40b2353`, `5d47925`).
- `package.json` local ainda está em **0.1.19** e possui mudanças não commitadas (deps novas: `@clack/prompts`, `@xterm/headless`, `node-notifier`, `node-pty`; `optionalDependencies: @opentui/core`; `files` inclui `runtime/`, `extensions/`, `DESIGN.md`, `PRODUCT.md`).
- Arquivos modificados não commitados: `package.json`, `package-lock.json`, `README.md`, `orquestrador/doctor.ps1`, `docs/rfcs/README.md`.
- Arquivos novos untracked: `DESIGN.md`, `PRODUCT.md`, `bun.lock`, `docs/architecture/` (12+ arquivos), `docs/rfcs/0004-execution-runtime-additivo.md`, `docs/superpowers/` (specs + plans), `extensions/vscode-maestro/`, `output/pdf/analise-fluxo-matt-pocock-orquestrador-maestro.pdf`.

**O que fazer:**
1. Inspecionar os commits do origin (`git log main..origin/main --oneline`) e avaliar sobreposição (ex.: `a416661` "task and workspace orchestration contracts" pode colidir com runtime untracked local).
2. Escolher estratégia de integração (rebase ou merge) e **apresentar ao maestro antes de executar**.
3. Resolver conflito de versão do pacote (local 0.1.19 vs origin 0.1.20) e decidir a versão de fechamento (0.1.21 ou 0.2.0, conforme escopo).
4. Decidir o fate de `bun.lock` (Bun é opcional; manter ou remover do package) e de `output/` (conteúdo pode ser privado — avaliar sanitização ou remoção).

### P3 — MÉDIA: registros DEV desatualizados (pré-M3)

- `DEV/VERIFY.md` — última verificação registrada em 2026-08-11 (escopo ADE/PTY). Sem evidência M3 (185 pass, gates, caracterização).
- `DEV/HANDOFF.md` — snapshot de 2026-08-11; "Latest Work" aponta ADE multigente e next context do milestone anterior; não menciona M3.
- `DEV/CONTEXT.md` — ainda OK nos comandos, mas sem menção ao M3; valide se o "Next Context" (lock de agente por workspace) continua vigente.

**O que fazer:**
1. Atualizar `DEV/VERIFY.md` (data 2026-08-14, escopo M3, comandos e resultados reais).
2. Atualizar `DEV/HANDOFF.md` (snapshot M3, próximos passos: fechamento P1/P2 e M4).
3. Revisar `DEV/CONTEXT.md` e `DEV/SPECS/ACTIVE.md` (status do M3: `implemented_verified` -> `completed_closed` após fechamento).

### P4 — MÉDIA: desvio de localização de testes sem registro de decisão

- A spec §4 previa `tests/planner/*.test.js`; a implementação criou os testes na raiz `tests/` (convenção real do repo — todos os testes são na raiz).
- Sem impacto funcional, mas sem rastro de decisão.

**O que fazer:**
1. Registrar 1 linha em `DEV/DECISIONS.md` ou ADR curto: manter testes na raiz `tests/` por consistência com a base existente; atualizar a spec se necessário.

### P5 — BAIXA: validações manuais pendentes (milestone anterior + plataforma)

- Attach **tmux com agente real** (Codex/Claude) nunca validado.
- Renderer **OpenTUI via Bun** exige Bun instalado manualmente (nunca instalar automaticamente).
- **Webview VS Code** pendente de validação visual em instância real.
- **node-pty sem binário** local: `g++` ausente; requer `npm rebuild node-pty` após instalar toolchain — teste PTY real continua limitado (contrato simulado passa).
- **Lock de agente por workspace** com 2 projetos reais nunca confirmado end-to-end.

**O que fazer:**
1. Documentar como riscos abertos explícitos no `DEV/VERIFY.md` (seção "Pending").
2. Montar checklist manual de validação (`DEV/TESTING.md` ou `DEV/RUNBOOKS/`) com os passos quando houver máquina com as dependências (tmux, Bun, VS Code, toolchain C++).
3. Não bloquear o fechamento do M3 por estes itens; eles são do escopo ADE/PTY, não do Semantic Planning.

### P6 — INFORMATIVO: M4 é o próximo milestone

- Model routing / execução por provider está fora do escopo M3 por design.
- Decidir com o maestro se o backlog M4 entra agora em `DEV/ROADMAP.md`/`DEV/BACKLOG/`.

---

## 4. Ordem de execução recomendada para fechar

| Ordem | Ação | Verificação |
|---|---|---|
| 1 | Versionar `runtime/` + testes untracked (P1) | `git status` limpo de untracked não intencionais; clone em `/tmp` roda `npm test` (185 pass) |
| 2 | Integrar `origin/main` (P2) | `git log` linear/mesclado; `npm test` verde; `npm pack --dry-run` OK |
| 3 | Resolver versão do pacote e decisões de conteúdo (`bun.lock`, `output/`) (P2) | `package.json` consistente; `validate-public.ps1` sem achados |
| 4 | Atualizar registros DEV (P3) | `check-dev-gates --strict` passed |
| 5 | Registrar decisão de testes na raiz (P4) | `DEV/DECISIONS.md` atualizado |
| 6 | Documentar riscos manuais (P5) | `DEV/VERIFY.md` com seção Pending |
| 7 | Fechar milestone e abrir M4 (P6) | `DEV/SPECS/ACTIVE.md` status `completed_closed`; backlog M4 criado |
| 8 | Apresentar ao maestro: resumo de commits e diffs pendentes para **autorização final** (commit/push) | Revisão humana do maestro |

## 5. Definition of Done (todos obrigatórios)

- [ ] Clone limpo em diretório temporário: `npm install` + `npm test` = 185 pass / 0 fail / 1 skip.
- [ ] `git status` sem arquivos untracked não intencionais; `git diff --check` limpo.
- [ ] `main` integrado com `origin/main` (sem conflitos pendentes) e versão de pacote decidida.
- [ ] `check-dev-gates --project-path . --strict` passed.
- [ ] `DEV/VERIFY.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, `DEV/SPECS/ACTIVE.md` refletem o estado real.
- [ ] Riscos manuais (P5) documentados; nenhum silenciado.
- [ ] `scripts/validate-public.ps1` (ou equivalente) passa **antes de qualquer push**; sem dados pessoais/tokens no diff.
- [ ] Maestro aprovou explicitamente o conjunto de commits e a publicação.

## 6. Comandos úteis de referência

```bash
npm test
git status --short
git log main..origin/main --oneline
git diff --cached --stat
node orquestrador/bin/check-dev-gates.js --project-path . --strict
npm pack --dry-run
git clone -b main <repo> /tmp/clone-check && cd /tmp/clone-check && npm test
```

**Resposta esperada ao final:** relatório curto com (a) o que foi feito por pendência, (b) evidência de verificação de cada gate, (c) diffs/commits propostos para o maestro aprovar, (d) riscos abertos remanescentes.