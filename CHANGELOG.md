# Changelog

## 0.1.23 - 2026-08-14

### Context Intelligence, Intent Refinement e Semantic Planning

- Adicionado o runtime M1–M3 versionado no repositório: contexto, refinamento de intenção, planejamento semântico e compatibilidade com o executor legado.
- Adicionado `orquestrador-maestro run` com execução de tarefas, inspeção, cancelamento e listagem de runs por projeto.
- Adicionados `projects`, `missions` e `terminal` (agent/shell/attach/close/start/stop) com preservação das interfaces nativas dos agentes.
- Adicionada a TUI do Maestro (`tui`) com misses, projetos, missões e PTY, mantendo a TUI clássica disponível.
- Adicionados `bridge --stdio` e `runtime` para integração por protocolo local e extensão VS Code.
- Adicionados adaptadores AI para Junie, Goose e OpenHands (`adapters`), com dry-run por padrão.
- Melhorias de compatibilidade de runtime/providers/workspaces, mantendo a CLI e o runtime existentes compatíveis (mudança aditiva).
- Dependências de runtime adicionadas para o cockpit: `@clack/prompts`, `@xterm/headless`, `node-notifier`, `node-pty`; OpenTUI segue opcional.

### Verificação

- 195 testes automatizados aprovados (0 falhas, 1 skip intencional).
- Validação pública, validação de skills, gates DEV estritos, empacotamento e `git diff --check` aprovados no fechamento do M3.

### Sincronização de skills entre clientes

- Corrigida a disponibilidade de `code-review` no OpenCode/DANTE, sincronizando a skill compatível para `.opencode/skills`.
- O sincronizador agora aceita diretórios nativos de compatibilidade por cliente, sem espalhar workflows específicos do Codex para outras ferramentas.
- Corrigida a prioridade das fontes nativas do Codex para preservar skills oficiais atualizadas do runtime, incluindo `.system`.
- Alinhados os sincronizadores PowerShell e Bash e documentada a auditoria completa de sincronização.

### Verificação

- 361 entradas de sincronização verificadas, sem divergências.
- 42 skills canônicas validadas, doctor sem problemas de roteamento e 22 testes automatizados aprovados.
- Validação pública, empacotamento e `git diff --check` aprovados.

## 0.1.22 - 2026-08-12

### Adaptadores de ferramentas AI-native

- Adicionado o catálogo `orquestrador/TOOL_ADAPTERS.json` para Junie CLI, Goose, OpenHands, Continue, Cline, GitHub Copilot CLI, Ollama e LM Studio.
- Adicionado `orquestrador-maestro adapters` com comandos de listagem, inspeção de caminhos, validação e renderização segura.
- Adicionado renderizador de projeto para Junie, Goose e OpenHands, com `dry-run` por padrão, `--apply` explícito e preservação de arquivos existentes.
- Mantido fora do escopo o gerenciamento de autenticação, modelos, provedores, MCP, extensões, sessões, cache, logs, histórico e bancos de dados.
- Adicionados testes de contrato e fixtures temporárias para os adaptadores P0.

### Verificação

- 22 testes automatizados aprovados.
- Validação pública, validação de skills, gates DEV estritos, empacotamento e `git diff --check` aprovados.
- Corrigida a resolução de `--project-path` relativo nos helpers `init-dev`, `compact-worklog` e `check-dev-gates`, inclusive na CLI instalada globalmente.

## 0.1.21 - 2026-08-12

### Evolução de workflow e coordenação

- Adicionado o Workflow Schema v2, preservando os campos legados e acrescentando etapas, eventos, gates humanos, retry manual e referências de workspace.
- Adicionado `orquestrador/TASK_SCHEMA.json` para padronizar tarefas, status, dependências, subtarefas, artefatos, aprovações e sessões de execução.
- Adicionado `orquestrador/WORKSPACE_SCHEMA.json` para descrever branches, worktrees, isolamento por repositório e executores sem publicar caminhos locais.
- Adicionada documentação da relação entre workflow, tarefa e workspace em `docs/task-and-workspace-contracts.md`.
- Adicionada cobertura de contrato em `tests/orchestration-contracts.test.js`.

### Compatibilidade e segurança

- Os novos contratos permanecem descritivos e opt-in; não executam agentes, não criam integrações obrigatórias e não autorizam efeitos externos.
- Paralelismo exige isolamento explícito, e commit, push, publicação e compartilhamento continuam sendo gates separados.

### Verificação

- 16 testes automatizados aprovados.
- Validação pública e validação de skills aprovadas.
- `git diff --check` aprovado.

## 0.1.20 - 2026-08-11

### Correção de funcionamento

- Publicado o fix que preserva o diretório de invocação ao executar os helpers DEV, fazendo `--project-path .` funcionar também na CLI instalada globalmente.
- Incluída regressão para a chamada da CLI a partir de um projeto externo.

## 0.1.19 - 2026-08-08

### Correções de funcionamento

- Corrigida a validação do `doctor` para aceitar skills nativas do Codex/OMX usadas como ponto de entrada de perfis, incluindo `phase-loop` com `plan`.
- Corrigidos os wrappers PowerShell de `check-dev-gates`, que falhavam ao receber `-Strict` e, em um dos caminhos, repassavam indevidamente o nome do comando ao parser.
- Adicionado teste de regressão dos dois wrappers PowerShell no Windows.
- Documentados os avisos de subagente, autenticação MCP e sandbox do Codex/DANTE.

### Verificação

- 12 testes automatizados aprovados.
- Validação pública, skills, gates DEV estritos, smoke test de instalação e auditoria de dependências aprovados.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades.

## 0.1.18 - 2026-08-06

### Evolução do workflow

- Adicionado o perfil opt-in `phase-loop`, inspirado em fluxos por fases como GSD, para organizar `discuss`, `plan`, `execute`, `verify` e `ship` sem alterar o caminho padrão.
- Adicionado o contrato declarativo `orquestrador/WORKFLOW_SCHEMAS.json` com workflows para construção, segurança, pesquisa e onboarding.
- Adicionada documentação de adoção gradual em `docs/workflows.md`, mantendo provedores e integrações opcionais.

### Contexto e verificação

- O briefing de contexto agora resume o estado de `DEV/`, incluindo fase, próxima ação, riscos e artefatos relevantes, respeitando o orçamento de caracteres.
- Adicionado um gate dedicado para validar hierarquia de `DEV/`, estado de fase, artefatos e documentação, com wrappers PowerShell e Bash.
- Adicionada cobertura de regressão para briefing, gates, workflows, catálogo de skills e execução em modo dry-run.

### Governança de skills

- O catálogo passou a aceitar metadados opcionais de proveniência e workflow, preservando fallback compatível para skills legadas.
- Adicionados schemas públicos para validar manifestos e registros de uso das skills.
- Os bootstraps PowerShell e Bash foram alinhados com a versão publicada `0.1.18`.

### Verificação

- `npm test`
- `npm run validate`
- `scripts/check-dev-gates.ps1`
- `git diff --check`
- `npm pack --dry-run`

## 0.1.17 - 2026-08-06

### Corrigido

- Corrigida a descoberta de skills no OpenCode: `orquestrador-maestro` agora possui metadados válidos, é sincronizada para todos os clientes roteados e não é mais marcada como diretório extra. Correção identificada a partir da dica de Felinto e Hector Noya (Mentorados).

## 0.1.16 - 2026-08-06

### Corrigido

- Corrigida a descoberta de skills no OpenCode: `orquestrador-maestro` agora possui metadados válidos, é sincronizada para todos os clientes roteados e não é mais marcada como diretório extra. Correção identificada a partir da dica de Felinto e Hector Noya (Mentorados).

- O bootstrap do Windows agora usa um prefixo npm estável no perfil do usuário, evitando que `fnm` direcione os binários para um diretório temporário de sessão durante atualizações.
- O fluxo de instalação e atualização preserva os launchers globais dos clientes, incluindo o OpenCode, após a troca de versão do Node.js.
- Os bootstraps Windows e Unix agora apontam para a mesma versão publicada da CLI (`0.1.16`).

## 0.1.15 - 2026-08-06

### APIs e skills

- Atualizadas oito skills de integração com APIs: AbacatePay, Stripe, Google Workspace, Evolution API, ElevenLabs, provedores de IA, Resend e Meta Ads/WhatsApp.
- AbacatePay v2 passou a ser a orientação padrão para novos projetos; rotas v1 e eventos `billing.*` ficaram explicitamente delimitados como legado.
- Adicionados limites de versionamento, endpoints atuais, eventos, requisitos de segurança, idempotência, licenciamento e links para documentação oficial.
- A skill de Meta Ads deixou de tratar um objetivo de campanha como universalmente superior e passou a exigir validação do fluxo atual da conta.
- Corrigido o detector de mojibake do catálogo para aceitar UTF-8 legítimo em português sem perder a detecção de texto quebrado.

### Verificação

- `scripts/validate-public.ps1`
- `scripts/validate-skills.ps1`
- `scripts/check-dev-gates.ps1`
- `git diff --check`

## 0.1.14 - 2026-08-05

- Adicionado briefing de contexto econômico para carregar apenas o contrato e a memória operacional necessários à intenção do Maestro.
- Mantida a experiência conversacional; o briefing é uma capacidade interna e os comandos existentes continuam compatíveis.
- Adicionados testes automatizados para orçamento, priorização e exclusão de histórico sensível.

Todas as mudanças relevantes do Orquestrador Maestro estão documentadas aqui.

## Correção pós-release - 2026-08-05

- Os bootstraps públicos agora instalam a CLI `0.1.13`, alinhada à versão atual do pacote, em vez de fixarem a versão antiga `0.1.11`.

## 0.1.13 - 2026-08-03

### Segurança

- Adicionada esteira defensiva com Gitleaks, Semgrep, OSV-Scanner, Trivy e Strix opt-in.
- Adicionados scripts PowerShell/Bash, documentação e workflow de verificação em Pull Request.
- Mantidos testes dinâmicos e pentest agentivo fora da execução automática, exigindo alvo e autorização explícitos.

## Unreleased - 2026-07-28

### RFCs e memória opcional

- Adicionada a convenção pública de RFCs em `docs/rfcs/`, separando proposta, decisão, implementação e verificação.
- Adicionadas RFCs iniciais para contrato de memória entre agentes, provider opcional e captura com privacidade.
- Adicionado o guia de integração opt-in com `ai-memory`, mantendo `DEV/` como fonte de verdade e sem dependência obrigatória no pacote.

### Contribuição comunitária
- Adicionada a skill `improve-codebase-architecture`, de Eduardo Queiroz, para análises arquiteturais com relatório HTML decisório, diagramas, comparação de impactos técnicos e de produto e referências em português.
- Kiver Teixeira (`kivervinicius`) relatou a perda de contexto entre sessões no Cursor e ajudou a direcionar a criação do comando `/maestro` para reidratação do contexto do Orquestrador.

### Persistência
- Criado o contrato canônico `orquestrador/PERSISTENCE.md`, aplicado aos entrypoints do Codex, OpenCode, Claude, Cursor, Gemini, Windsurf e Antigravity.
- Os verificadores agora exigem o contrato de persistência e confirmam que os perfis globais apontam para ele.
- Fernando Bolzan conduziu esta atualização para tornar a persistência do Orquestrador Maestro explícita e compartilhada entre os softwares.

## 0.1.12 - 2026-07-22

### Corrigido

- O Cursor agora instala o comando `/maestro` em `.cursor/commands/maestro.md` para reidratar o contrato global e o contexto ativo de `DEV/` quando uma sessão perde continuidade.
- A instalação e os verificadores PowerShell/Bash agora validam a presença do comando de recuperação de contexto.

### Contribuição comunitária

- Kiver Teixeira (`kivervinicius`) foi reconhecido pelo relato que direcionou essa correção de continuidade entre sessões.
## 0.1.11 - 2026-07-20

### Corrigido

- No macOS/Linux, instalação e desinstalação agora fazem backup somente dos arquivos gerenciados pelo Orquestrador dentro dos perfis das ferramentas.
- Sessões, autenticação, caches, bancos locais e demais arquivos pessoais em `.codex`, `.claude`, `.cursor`, `.gemini` e perfis equivalentes não são mais copiados para `.orquestrador-public-backups`.
- Os testes completos agora criam uma sessão pessoal sentinela e comprovam que ela não é copiada nem removida durante instalação e desinstalação.

## 0.1.10 - 2026-07-20

### Corrigido

- O bootstrap macOS/Linux agora valida Node.js 18+, recusa root, tolera `SHELL` ausente e seleciona apenas prefixos npm completamente graváveis.
- O bootstrap Windows agora recusa sessão elevada, valida Node.js 18+ e faz fallback seguro quando o prefixo npm protegido não pode ser criado ou escrito.
- A versão instalada é confirmada por `npm root -g`, evitando suposições incorretas sobre o layout do prefixo.
- A sincronização e a verificação de skills voltaram a concordar: 42 skills canônicas cabem nos limites declarados de todas as integrações.
- A fonte canônica de `skill-lgpd-brasil` foi restaurada e a skill de WhatsApp Meta Ads foi registrada no manifesto e no roteador.
- O validador do catálogo volta a passar com metadados completos nas skills canônicas.
- A auditoria de dependências ignora exemplos opcionais ausentes em vez de falhar com erro de processo.

### Testado

- Instalação completa, verificação e desinstalação em PowerShell e Bash.
- Ciclo do tarball npm: instalação global em prefixo de usuário, `version`, `install`, `verify`, `update`, `doctor` e `uninstall`.
- Compatibilidade sintática dos scripts Unix e validação pública do conteúdo do pacote.

## Unreleased - 2026-07-19

### Adicionado
- README agora possui a seção concisa `Capacidades Atuais`, cobrindo a superfície pública do sistema: instalação e atualização portáteis, ferramentas de IA suportadas, bootstrap de projetos, roteamento de skills, hooks, perfis de execução, subagentes opcionais, validação, diagnóstico, controles de privacidade e fluxo de memória operacional `DEV/`.
- README agora aponta para `CHANGELOG.md` como histórico canônico de atualizações, migrações, pesquisas, correções e contribuições da comunidade.
- README agora aponta para o diretório de pesquisas e para a documentação do fluxo de atualização, sem duplicar radares históricos extensos.
- Crédito comunitário a Eduardo Queiroz, do Grupo IAPro, pela indicação do fluxo de desenvolvimento assistido por IA de Matt Pocock, recomendado por uma desenvolvedora da Microsoft.
- Consolidada a documentação de requisitos, troubleshooting, metadados do GitHub, flags do instalador, matrizes de entrypoints e bootstrap dos clientes suportados.

### Comunidade
- `kivervinicius`: fork e PR #1 adicionaram o suporte multiplataforma para Linux e macOS, incluindo instaladores Bash, verificação Unix, inicialização de `DEV/` e sincronização de skills.
- `kivervinicius`: PR #2 consolidou a criação, o catálogo, o manifesto, a sincronização e a validação de skills canônicas.
- Bruno, do Grupo IAPro: curadoria das referências RTK e Caveman, contribuindo para economia de contexto, leitura mais seletiva e uso mais consciente de `DEV/`.
- Hector Noya e Felinto, do Grupo IAPro: curadoria de Ponytail, React Doctor e Headroom, contribuindo para gates de implementação mínima, revisão React determinística e compressão de contexto opt-in.
- Eduardo Queiroz, do Grupo IAPro: indicação do fluxo de desenvolvimento assistido por IA de Matt Pocock, recomendado por uma desenvolvedora da Microsoft.

### Alterado
- O detalhamento das melhorias recentes e dos radares de maio e junho foi retirado do fluxo principal do README e concentrado no CHANGELOG e nos documentos de pesquisa vinculados.
- O README foi mantido focado no que o sistema faz, em instalação e atualização, integrações, fluxo operacional, segurança, privacidade e contribuição.
- A data de revisão do README foi atualizada para 2026-07-19, esclarecendo que ele é a visão prática do sistema e que o `CHANGELOG.md` é o histórico detalhado.
- O histórico comunitário do fork Linux/macOS e das PRs #1 e #2 de `kivervinicius`, além das curadorias de RTK/Caveman, Ponytail, React Doctor e Headroom, foi consolidado nesta seção.
- A documentação registra o hardening do instalador Unix: evita `readlink -f`, suporta Bash antigo, preserva fontes de skills, protege remoções recursivas e aceita `--home-path` para testes isolados.

### Corrigido
- Resumos históricos duplicados foram removidos do README para reduzir divergências entre a documentação e as notas de versão.
- O texto em português, seguro para UTF-8, e o modelo de sanitização pública foram preservados.
- A orientação de troubleshooting do README foi consolidada na documentação canônica sem remover as instruções operacionais.

### Migração
- Nenhuma migração de instalação é necessária. Use o README para a visão atual do sistema e o `CHANGELOG.md` para o histórico completo antes de atualizar.

## 0.1.3 - 2026-07-15

### Adicionado
- Integração com Grok CLI para Windows, Linux e macOS por meio de `~/.grok/config.toml`, `AGENTS.md` e das raízes compartilhadas `.agents/skills` e `.orquestrador/skills`.
- `skill-optimize-images`, roteada por expressões como “otimizar imagem”, “imagem para blog”, “imagem para site”, WebP e AVIF.
- `scripts/install-grok-orquestrador.ps1` e `scripts/install-grok-orquestrador.sh` para configuração portátil do Grok.
- `skill-lgpd-brasil` como skill canônica de LGPD e privacidade em `orquestrador/skills/`, com roteamento para dados pessoais, consentimento, RIPD, direitos do titular, retenção, incidentes e transferências internacionais.
- O radar de junho de 2026 passou a incluir Ponytail, React Doctor e Headroom como referências para gates de implementação mínima, revisão React determinística e compressão de contexto opt-in.
- A seção de contribuições do README passou a registrar Hector Noya e Felinto, do Grupo IAPro, como colaboradores da trilha Ponytail, React Doctor e Headroom.

### Alterado
- README e documentação dos perfis de ferramentas agora incluem instalação, descoberta e verificação do Grok CLI.
- As skills de front-end agora incluem um fluxo inspirado no Impeccable, com contexto persistente de design, roteamento por sintomas, orientação produto versus marca, detecção de antipatters, pontuação de qualidade e gates de auditoria antes da entrega.
- A orientação de front-end agora documenta `PRODUCT.md`, `DESIGN.md`, passes como `typeset`, `layout`, `colorize`, `adapt`, `distill`, `quieter` e `bolder`, além da validação opcional `npx impeccable detect`.
- README, catálogo, aliases e roteador agora apresentam a skill de LGPD junto das rotas existentes de privacidade e SaaS.
- `docs/research/repo-radar-2026-06.md` foi reescrito com UTF-8 correto e decisões ampliadas sobre otimização de contexto, gates React e compressão reversível.

### Corrigido
- Os scripts Unix de instalação e verificação agora protegem arrays Bash vazios, mantendo `install.sh` e `scripts/verify-install.sh` compatíveis com o `/bin/bash` 3.2 do macOS sob `set -euo pipefail`.

## 0.1.2 - 2026-06-29

### Adicionado
- `skill-cobranca-automatizada-saas-abacatepay` como nova skill canônica de cobrança em `orquestrador/skills/`, com gatilhos para cobrança automatizada, régua de cobrança, fatura, dunning, expiração de trial, portal de faturas e fluxos administrativos.
- `orquestrador-maestro changelog` para exibir as notas de versão empacotadas e o fluxo recomendado de atualização.
- `orquestrador-maestro doctor` para expor o diagnóstico de instalação já fornecido por `orquestrador/doctor.ps1`.
- `orquestrador-maestro init-dev` para criar a hierarquia compacta `DEV/` com `HANDOFF.md`, `SPECS/ACTIVE.md`, `VERIFY.md` e `WORKLOG.md` curto.
- `orquestrador-maestro compact-worklog` e `orquestrador-maestro check-dev-gates` para manter a memória compacta, arquivar histórico antigo e validar o contrato `spec + handoff + verify + worklog`.
- `docs/research/repo-radar-2026-06.md` com a pesquisa de 26 de junho de 2026 sobre projetos e referências públicas.
- `docs/reference-packs.md` e `orquestrador/REFERENCE_PACKS.md` para padronizar bibliotecas locais de referência sem publicar materiais privados.

### Alterado
- README e catálogo público agora apresentam a skill de cobrança automatizada junto das rotas existentes de AbacatePay, Stripe, limites e administração.
- README agora apresenta a data de auditoria, o fluxo de atualização, o radar de junho e a stack de UX/UI baseada em `skill-open-design-ui`, `skill-modern-ui-patterns` e `skill-frontend-ux-guardrails`.
- README, `docs/project-dev-hierarchy.md`, `docs/context-economy.md`, `docs/orquestrador-reference.md`, `docs/installation.md` e `docs/npm-package.md` agora descrevem o loop determinístico baseado em `HANDOFF.md`, `SPECS/ACTIVE.md`, `VERIFY.md`, `check-dev-gates` e `compact-worklog`.
- `docs/update-flow.md` agora exige atualizar `CHANGELOG.md` e o resumo do README antes da publicação, além do smoke flow do pacote.
- `docs/npm-package.md` agora trata `changelog` e `doctor` como comandos principais, junto de install, update, verify, uninstall e telemetria.
- A orientação de contribuição agora usa `CHANGELOG.md` como histórico canônico e mantém o README como resumo rápido.
- Hooks de Claude, Cursor, Gemini, Windsurf e OpenCode agora funcionam como shims compactos e delegam o roteamento a `SKILL_EXECUTION_PROFILES.json`, `SKILL_ALIASES.json`, `SKILLS_ROUTER.json` e `SKILL_CHAINS.json`.
- `docs/context-economy.md`, `docs/orquestrador-reference.md` e README agora documentam explicitamente a arquitetura de hooks compactos.
- Instaladores e sincronizadores agora mantêm as raízes nativas de skills enxutas em todos os clientes suportados, movendo bibliotecas grandes para `.orquestrador/skill-library/` e offloadando excesso para `.orquestrador/skill-library/disabled-native`.

### Corrigido
- O conjunto nativo minimo do Codex agora preserva `orquestrador-maestro`, `doctor` e `ralplan`, evitando divergencia entre a politica enxuta de skills e os perfis instalados.
- Instalações existentes agora têm um caminho explícito de verificação pós-atualização: `npm update -g`, `orquestrador-maestro changelog`, `orquestrador-maestro update`, `orquestrador-maestro verify` e `orquestrador-maestro doctor`.
- `orquestrador/doctor.ps1` no longer treats legitimate accented UTF-8 text such as `PADRÃO` as mojibake just because it contains `Ã`.
- Validações e diagnósticos agora sinalizam catálogos antigos de hooks antes que voltem ao snapshot público ou à instalação local.
- `sync-skills.ps1`, `sync-skills.sh`, `verify-install.ps1`, `verify-install.sh`, and `doctor.ps1` agora detectam raízes nativas de skills infladas, restauram o conjunto mínimo gerenciado e deixam de empurrar centenas de diretórios para cada cliente por padrão.

### Segurança
- Bibliotecas privadas de fontes como Google Drive agora são documentadas como pacotes somente locais. Elas não são vendorizadas no snapshot público e devem ser indexadas antes da leitura pelos agentes.
- Os novos comandos da CLI seguem o mesmo modelo de privacidade: não exigem caminhos locais, conteúdo de projetos, tokens ou identificadores pessoais.

### Migração
- Usuários devem atualizar com:
  - `npm update -g @iapro/orquestrador-maestro-cli`
  - `orquestrador-maestro changelog`
  - `orquestrador-maestro update`
  - `orquestrador-maestro verify`
  - `orquestrador-maestro doctor`
- Instalações existentes com centenas de skills nativas serão compactadas durante `orquestrador-maestro update`, preservando os diretórios movidos em `.orquestrador/skill-library/disabled-native`.
- Projetos que quiserem o novo fluxo econômico em tokens devem executar `orquestrador-maestro init-dev --project-path .` e manter `DEV/HANDOFF.md`, `DEV/SPECS/ACTIVE.md`, `DEV/VERIFY.md` e um `DEV/WORKLOG.md` compacto atualizados.

## 0.1.1 - 2026-05-25

### Adicionado
- GIFs no README para instalação, fluxo de execução e atualização segura.
- `scripts/generate-readme-gifs.py` para regenerar os assets visuais com layout consistente.
- `npm run audit` e `npm run outdated:all` para auditar o pacote raiz e workspaces de exemplo com lockfiles.

### Alterado
- README reorganizado para explicar o modelo mental, a hierarquia, o uso de `DEV/` e o fluxo de atualização antes do mapa completo de arquivos.
- Dependências atualizadas dentro da janela de compatibilidade suportada pelo Node.js 18+.

### Segurança
- Auditoria npm limpa nos pacotes com lockfiles, mantendo intencionalmente upgrades incompatíveis como `better-sqlite3@12` e `express@5` fora da atualização.

### Migração
- Nenhuma migração incompatível é esperada. Usuários instalados podem executar `npm update -g @iapro/orquestrador-maestro-cli`, seguido de `orquestrador-maestro update` e `orquestrador-maestro verify`.

## 0.1.0 - 2026-05-25

### Adicionado
- Primeira versão pública no npm de `@iapro/orquestrador-maestro-cli`.
- Comandos da CLI `install`, `update`, `verify`, `list-targets` e `uninstall`.
- Snapshot público com o núcleo do Orquestrador, skills do Codex, perfis de ferramentas, hooks e documentação de instalação.

### Segurança
- Gates de validação pública para bloquear tokens, logs, caches, backups, memórias locais, caminhos reais de usuário e arquivos privados do snapshot publicado.
