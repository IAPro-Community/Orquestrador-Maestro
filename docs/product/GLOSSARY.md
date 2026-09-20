# Maestro — Glossário (GLOSSARY)

- **Project**: raiz identificada deterministicamente pelo caminho absoluto.
- **Mission**: intenção decomposta em tarefas.
- **Task**: unidade de trabalho; **TaskGraph**: suas dependências.
- **Run / Step / Execution**: execução rastreável via provider.
- **Provider**: adapter real (`detect/capabilities/execute` + lifecycle).
  Só `codex`, `claude`, `opencode`, `agy` são providers.
- **Agent**: processo efêmero da ferramenta, executado pelo provider.
- **Skill**: capacidade empacotada com `SKILL.md`, registrada no manifesto.
- **Workspace / Worktree**: isolamento `shared` ou git worktree dedicado.
- **Artifact**: saída registrada do run.
- **Verification**: checagens da safe-list (`lint/typecheck/test/build`).
- **Evidence**: pacote imutável do benchmark com hashes e outputs.
- **Memory**: episódica JSONL redigida (local) + curadoria.
- **DEV**: memória operacional canônica do projeto, curada por humanos.
- **Governance**: portões de mudança e compatibilidade.
- **Interaction Profile**: como a IA apresenta escolhas (`default/focus`).
- **Execution Profile**: quantas skills e quanto rigor (`fast/standard/…`).
- **Runtime**: executor local opcional (providers, runs, verificação).
- **Cockpit**: superfície de acompanhamento (TUI + VS Code), não o produto.
- **Bridge**: API JSON-RPC v1 sobre stdio + eventos v2 para clientes.
- **Compatible**: entende/recebe o contrato Maestro (NÃO implica execução).
- **Integrated**: possui integração mantida (config/skills/hooks/adapters/bridge).
- **Runtime Provider**: adapter real com detect+exec+lifecycle+testes.
- **Experimental**: implementado, sem contrato estável.
- **Planned**: projetado, sem implementação suficiente para claim atual.
