# ADR — Maestro como núcleo independente e canônico do ecossistema

- **Data:** 2026-11-01
- **Decisão de produto:** aceita; implementação incremental **não concluída**
- **Owner:** Orquestrador-Maestro
- **Issue:** [Maestro #45](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/45)
- **Consumers:** Nexus, CLI, IDEs, agentes e aplicações futuras

## Contexto

O Maestro já funciona autonomamente, com CLI, Skills, política, contexto de projeto, runtime, RunStore, verificação, memória e Bridge JSON-RPC v1. O Nexus possui camadas de memória, composição e execução que podem conflitar com a autoridade canônica. A integração precisa reforçar o ecossistema, não tornar o Maestro um submódulo do Nexus.

## Decisão

1. **Maestro é independente.** Instalar, atualizar, usar ou desinstalar o Nexus não pode alterar unilateralmente o funcionamento ou os dados do Maestro. CLI e outros consumidores continuam funcionando sem o Nexus.
2. **Autoridade do projeto.** Maestro responde por identidade/escopo, contexto, conhecimento/memória semântica, regras, decisões, Skills, composição canônica, políticas, workflows e execução/avaliação dos runs que ele possui. O repositório Git permanece fonte dos seus arquivos; Maestro organiza o contexto derivado, não reivindica propriedade dos blobs Git.
3. **Cliente não é motor.** Nexus e demais clientes consomem o Bridge/API versionada; não importam código interno do runtime, não acessam diretamente RunStore/memória, não copiam o motor nem persistem uma segunda versão semântica.
4. **Um dono por run.** O proprietário da execução fica explícito (`MAESTRO` para work delegado; `NEXUS` para terminal/execução legada independente). Apenas o proprietário executa, cancela, retoma ou conclui; clientes apresentam projeções de estado/evidência.
5. **UI pertence ao cliente.** Composer visual, Flow editável, Browser, painel, janelas, PTY interativo e preferências locais do Nexus não são memória canônica e não precisam migrar ao Maestro.
6. **Falha explícita.** Capacidades que dependem do Maestro não fazem fallback silencioso para memória ou planner do Nexus, outro cloud, outro executor, nem marcam continuidade stale como confirmada. Operações independentes do Nexus podem permanecer disponíveis.
7. **Sem corte inseguro.** Migração de dados legados exige inventário, backup, mapeamento de escopo, idempotência, verificação, controle de escritores, rollback e aceite antes de apagar ou desativar o caminho antigo.

## Contrato de integração progressivo

### Etapa 0 — Bridge v1 read-only

`context.brief` é fonte existente e canônica de contexto. O novo `project.context` é uma projeção pequena, versionada e read-only que reúne o resultado do builder existente e a identidade/estado do projeto no Bridge, **sem criar novo planner, banco ou memória**. Os campos e limitações são documentados em `docs/architecture/MAESTRO_INTEGRATION_API.md`. Um cliente deve consultar `initialize` e verificar `capabilities.projectContext` antes de usar o método. A projeção não garante snapshot atômico entre Git e RunStore.

### Etapa 1 — Composição e memória

Reaproveitar [#41](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/41) para read/write semântico controlado e criar contrato de `project.compose`/plano revisável sob autoridade Maestro. O Composer/Flow do Nexus exibirá e editará esses artefatos sem inventar substitutos próprios. Memória de project/branch/worktree segue regras e proveniência do Maestro.

### Etapa 2 — Execução externa robusta

`runs.create` v1 é bloqueante, `runs.subscribe` não suporta streaming por stdio e a persistência atual tem limites para múltiplos processos. Não prometer operações duráveis desacopladas enquanto não houver contrato formal de idempotência, eventos/replay, owner, retries, recovery e observabilidade. Esses recursos devem ser implementados no Maestro e testados sem Nexus.

## Critérios de aceite arquiteturais

- Executar Maestro isolado com CLI/Bridge + contexto/memória/Skills e runs autorizados, sem Nexus instalado.
- Abrir o mesmo projeto via Nexus e via CLI do Maestro e obter contexto canônico por escopo, com proveniência e digest; nenhum dado divergente é promovido sem revisão.
- Negar acesso cross-project, preservar limites/redaction e reportar versão/capability incompatível.
- Demonstrar 2 clientes e worktrees isolados, falha/restart, migração/rollback e comprovação de owner por run.
- Nunca remover dados ou código legado enquanto os caminhos novos não estiverem homologados.

## Regra de arquivamento

Implementações em consumidores que dupliquem a composição, memória semântica ou executor canônico são **candidatas a descontinuação**, registradas com evidências e dependências. A remoção ocorre apenas por PR próprio após paridade funcional, migração e rollback validados.

Referência Nexus: [#176](https://github.com/IAPro-Community/nexus/issues/176).
