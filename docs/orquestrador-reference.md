# Referência técnica do Orquestrador

Este é o mergulho técnico para quem quer auditar como o Maestro escolhe skills, mantém o contexto curto e aplica regras entre ferramentas. Para uma visão de produto e instalação, comece pelo [README](../README.md).

Para a lista completa de skills publicadas, use tambem [skill-catalog.md](skill-catalog.md).
Para a estrategia de economia de contexto, use [context-economy.md](context-economy.md).

## Ideia Central

O Orquestrador nao e uma ferramenta unica. Ele e uma camada de regras, roteamento e memoria que prepara varias IAs para trabalhar do mesmo jeito no computador do usuario.

O fluxo esperado agora e:

1. Ler as regras globais do usuario.
2. Ler as regras do projeto atual.
3. Ler `DEV/INDEX.md`.
4. Ler `DEV/HANDOFF.md`.
5. Ler `DEV/CONTEXT.md`.
6. Ler `DEV/SPECS/ACTIVE.md`.
7. Escolher a skill minima que resolve a tarefa.
8. Executar com o menor contexto suficiente.
9. Verificar antes de concluir.
10. Atualizar `DEV/WORKLOG.md`, `DEV/VERIFY.md` e `DEV/HANDOFF.md`.
11. Compactar o worklog e rodar gates quando a tarefa for longa.

## Fontes De Verdade

| Arquivo | Funcao |
|---|---|
| `orquestrador/rules.md` | Contrato global: hierarquia, qualidade, seguranca, `DEV/`, verificacao e sync. |
| `orquestrador/maestro.md` | Protocolo de execucao: observar, rotear, selecionar, agir, verificar e reportar. |
| `orquestrador/hooks.md` | Roteador compacto dos hooks de preflight, verificacao, sync, skills e orcamento de tokens. |
| `orquestrador/SKILLS_INDEX.md` | Indice curto para encontrar o roteador certo sem carregar catalogo completo. |
| `orquestrador/SKILL_ALIASES.json` | Mapeia termos do usuario para uma skill canonica. |
| `orquestrador/SKILLS_ROUTER.json` | Catalogo operacional das skills canonicas, com gatilhos, caminhos, custo e seguranca. |
| `orquestrador/SKILL_CHAINS.json` | Define quais skills podem ser combinadas depois que uma skill principal e escolhida. |
| `orquestrador/SKILL_EXECUTION_PROFILES.json` | Define perfis `fast`, `standard`, `deep`, `multiagent`, `saas` e `security`. |
| `orquestrador/SKILL_USAGE_SCHEMA.json` | Esquema para logar uso de skills em JSONL quando a ferramenta suportar. |
| `orquestrador/PROGRAM_ENTRYPOINTS.json` | Mapa dos arquivos que cada ferramenta deve ler no home do usuario e dos bootstraps de workspace para VS Code/GitHub Copilot, Continue, JetBrains AI Assistant, Aider, Cline e Windsurf. |
| `orquestrador/PROJECT_DEV_HIERARCHY.md` | Convencao da pasta `DEV/` em projetos. |
| `orquestrador/bin/dev-context-tools.js` | Helpers de compactacao e gate para manter `DEV/` utilizavel com baixo contexto. |

## Logica De Roteamento

O roteamento foi desenhado para economizar tokens. A IA nao deve abrir todas as skills para decidir o que fazer.

1. Identifica o tipo de tarefa pelo pedido do usuario e pelo projeto atual.
2. Escolhe um perfil em `SKILL_EXECUTION_PROFILES.json`.
3. Procura termos em `SKILL_ALIASES.json`.
4. Confirma a skill principal em `SKILLS_ROUTER.json`.
5. Se a tarefa pedir mais de uma frente, consulta `SKILL_CHAINS.json`.
6. Abre so o `SKILL.md` da skill escolhida e, se necessario, referencias diretas dessa skill.
7. Executa a tarefa e valida de acordo com o perfil.

Exemplo: um pedido como "criar SaaS com Stripe e dashboard" cai em `skill-saas-factory`. A cadeia permite chamar `skill-stripe-integration`, `skill-saas-admin-dashboard`, `skill-saas-core-limits` e skills de seguranca se a evidencia da tarefa justificar.

## Perfis De Execucao

| Perfil | Quando usar | Limite de skills | Delegacao | Validacao |
|---|---|---:|---|---|
| `fast` | Resposta curta, ajuste pequeno ou tarefa obvia. | 1 | Nao | Verificacao minima util. |
| `standard` | Caminho padrao para a maioria das tarefas. | 3 | Nao | Validacao proporcional a mudanca. |
| `deep` | Mudanca ampla, multi-sistema ou risco maior. | 5 | Sim | Lint, typecheck, teste, build ou doctor. |
| `multiagent` | Usuario pede agentes, time, swarm ou paralelismo. | 5 | Sim | Integracao mais verificacao por frente. |
| `saas` | Produto SaaS, dashboard, pagamento, tenancy ou admin. | 5 | Sim | Gates do projeto mais seguranca. |
| `security` | Scan ou auditoria defensiva autorizada. | 4 | Sim | Gates de seguranca. Exige autorizacao explicita. |

## Hooks

No repositorio, "hook" significa uma regra operacional que dispara antes, durante ou depois do trabalho. Alguns hooks sao documentos de orientacao para a IA; outros sao scripts instalaveis de Git.

| Hook | Onde fica | O que faz |
|---|---|---|
| Preflight hook | `orquestrador/hooks.md` | Antes de trabalho amplo, manda ler `AGENTS.md`, `DEV/INDEX.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, `DEV/SPECS/ACTIVE.md`, perfis, aliases e router. |
| Automatic skill hook | `orquestrador/hooks.md` e hooks de ferramentas | Delega o roteamento para `SKILLS_ROUTER.json`, `SKILL_ALIASES.json` e `SKILL_CHAINS.json` sem duplicar catalogos longos. |
| Token budget hook | `orquestrador/hooks.md` | Impede carregar catalogos completos; limita skills por perfil; manda compactar `WORKLOG` quando necessario. |
| Verification hook | `orquestrador/hooks.md` | Obriga verificacao antes de dizer que terminou; para config global recomenda `doctor.ps1`. |
| DEV gate hook | `orquestrador/bin/dev-context-tools.js` | Valida a combinacao `spec + handoff + verify + worklog` antes de handoff amplo ou tarefa longa. |
| DEV compaction hook | `orquestrador/bin/dev-context-tools.js` | Mantem `WORKLOG` curto, move historico para `HANDOFFS/WORKLOG_ARCHIVE.md` e atualiza `HANDOFF.md`. |
| Sync hook | `orquestrador/hooks.md` | Depois de mudar uma skill compartilhada, manda rodar `sync-skills.ps1 -Apply` no Windows ou `sync-skills.sh --apply` no Linux/macOS. |
| Usage log hook | `SKILL_USAGE_SCHEMA.json` | Define um log JSONL opcional para medir quais skills foram selecionadas e abertas. |
| Tool entrypoint hook | `PROGRAM_ENTRYPOINTS.json` e `tool-profiles/` | Faz Codex, OpenCode, Claude, Cursor, Gemini, Grok, MiMo Code, Kimi Code, Windsurf e Antigravity chamarem o Orquestrador por padrão; VS Code/GitHub Copilot, Continue, JetBrains AI Assistant, Aider, Cline e Windsurf em nível de projeto entram via bootstrap de workspace. |
| Security Git hooks | `skill-security-hooks/scripts/install-security-hooks.cmd` | Instala `.githooks/pre-commit` e `.githooks/pre-push` em repositorio autorizado. |

Em outras palavras: o hook da ferramenta nao deve ser a arvore de decisao completa. Ele so precisa lembrar a ordem correta de leitura e apontar para o roteador central. Isso preserva o mesmo comportamento com custo de contexto muito menor.

## Instalacao E Sync

O `install.ps1` da raiz e um wrapper conservador para Windows. Por padrao ele chama `scripts/install.ps1` com `-Force` e instala perfis de ferramentas, a menos que o usuario passe `-NoForce`, `-NoToolProfiles` ou `-CoreOnly`.

O `install.sh` da raiz e o wrapper equivalente para Linux/macOS. Por padrao ele chama `scripts/install.sh` com `--force` e instala perfis de ferramentas, a menos que o usuario passe `--no-force`, `--no-tool-profiles` ou `--core-only`.

Os wrappers tambem aceitam previa e manutencao segura:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ListTargets
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Only codex
orquestrador-maestro install --only codex,cursor,claude
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall -DryRun
```

Linux/macOS:

```bash
bash install.sh --dry-run
bash install.sh --list-targets
bash install.sh --only codex
bash install.sh --uninstall --dry-run
```

Os motores `scripts/install.ps1` e `scripts/install.sh` tambem copiam os helpers de contexto em `.orquestrador/bin/`:

- `init-project-dev.ps1` / `init-project-dev.sh`
- `compact-worklog.ps1` / `compact-worklog.sh`
- `check-dev-gates.ps1` / `check-dev-gates.sh`
- `dev-context-tools.js`

Depois da revisao de contexto de junho de 2026, o instalador nao replica mais catalogos gigantes diretamente nas raizes nativas. Ele copia as bibliotecas grandes para:

```text
.orquestrador\skill-library\community-skills
.orquestrador\skill-library\codex-skills
```

E entao usa o sync para manter as skills nativas enxutas.

O `sync-skills.ps1` e o `sync-skills.sh` mantem as skills canonicas do manifesto nas raizes nativas:

```text
.codex\skills
.opencode\skills
.agents\skills
.claude\skills
.cursor\skills
.gemini\skills
.windsurf\skills
.antigravity-skills\skills
```

Para VS Code e GitHub Copilot, o caminho suportado e o bootstrap de projeto: `orquestrador-maestro init-dev --project-path <repo>` cria `.github/copilot-instructions.md` e `.vscode/extensions.json` com o contrato do Orquestrador. O mesmo bootstrap também cria arquivos de projeto para Continue, JetBrains AI Assistant, Aider, Cline e Windsurf quando presentes no suporte atual.

No caso do Codex, o sync tambem mantem apenas um subconjunto nativo de workflows OMX (`orquestrador-maestro`, `autopilot`, `doctor`, `plan`, `ralplan`, `ralph`, `team`, `ultrawork`, `deep-interview`, `code-review`, `security-review`, `web-clone`, `worker`, `ask-claude`, `ask-gemini` e `.system`).

## Verificacao

Use `scripts/verify-install.ps1` depois de instalar. Ele verifica:

- `rules.md`, `maestro.md`, `PROJECT_DEV_HIERARCHY.md`, `SKILLS_INDEX.md`, `SKILLS_ROUTER.json` e skills canonicas;
- `%USERPROFILE%\AGENTS.md`;
- skills, agentes e prompts do Codex;
- os novos helpers `compact-worklog`, `check-dev-gates` e `dev-context-tools.js`;
- raizes nativas minimas `.agents`, `.claude`, `.opencode`, `.cursor`, `.gemini`, `.windsurf` e `.antigravity-skills`;
- entry points Antigravity: `antigravity-rules.json`, `.antigravity/antigravity.json`, `.antigravity/settings.json` e `.ai-standards`;
- entrypoints de ferramentas quando os perfis nao foram pulados;
- presenca de `DEV/WORKLOG.md` nas regras globais e perfis principais;
- configuracao OpenCode com `~/.orquestrador/rules.md` e `~/.orquestrador/maestro.md`.

Para um projeto especifico, o fluxo recomendado agora e:

```bash
orquestrador-maestro init-dev --project-path .
orquestrador-maestro check-dev-gates --project-path . --max-entries 12 --strict
orquestrador-maestro compact-worklog --project-path . --keep 12
```

Use `scripts/validate-public.ps1` antes de publicar. Ele valida JSON, paths proibidos, diretorios locais, arquivos de log/backup, padroes provaveis de segredo, caminhos concretos de usuario e mojibake.
