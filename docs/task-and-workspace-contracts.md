# Contratos de tarefa e workspace

Estes contratos tornam trabalhos maiores retomáveis sem entregar autonomia ilimitada à ferramenta. Leia esta referência ao definir workflow, artefatos, dependências ou gates humanos.

O Maestro usa três contratos relacionados:

1. `WORKFLOW_SCHEMAS.json` descreve fases, etapas, eventos e gates.
2. `TASK_SCHEMA.json` descreve uma unidade de trabalho e suas dependências.
3. `WORKSPACE_SCHEMA.json` descreve onde a tarefa pode operar e como evitar colisões.

Para execução retomável, o lock e o cursor são mantidos separados: `WORKFLOW_LOCK_SCHEMA.json` descreve a resolução determinística versionável em `DEV/WORKFLOWS/`, enquanto `WORKFLOW_STATE_SCHEMA.json` descreve o cursor local-only em `.local/orquestrador/workflow-state/`. O cursor só é aceito quando o `lockDigest` coincide.

## Relação entre os contratos

```text
Task
├── workflow → Workflow.steps
├── repositories → Workspace.repositories
├── currentStep → etapa ativa
├── artifacts → evidências produzidas
└── approvals → gates humanos
```

## Regras de implementação futura

- A implementação deve aceitar os campos legados `phases` e `gates`.
- Um executor pode interpretar `onEnter`, `onComplete` e `onFailure`, mas não pode inferir autorização para efeitos externos.
- Tarefas filhas devem herdar defaults do pai e registrar somente as exceções.
- Paralelismo exige worktrees ou outra forma explícita de isolamento.
- O estado transitório de um executor deve ficar separado dos artefatos públicos e dos arquivos `DEV/`.
- O state local não deve ser lido pelo briefing, publicado ou usado como fonte canônica.
- Gates humanos só podem ser atravessados após aprovação explícita; drift do lock bloqueia a operação.
- Commit, push, publicação e compartilhamento devem ser gates distintos.

Os schemas são contratos portáveis, não uma autorização para executar comandos.
