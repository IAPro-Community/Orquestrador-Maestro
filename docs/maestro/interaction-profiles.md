# Interaction Profiles

Interaction Profiles são configuração de apresentação independente do perfil de
execução. `--profile` continua escolhendo como o provider executa; `--interaction`
escolhe como o Maestro orienta e apresenta o fluxo.

## Precedência

`--interaction` vence a configuração do projeto, que vence a configuração do
usuário, que vence `default`. A configuração fica no arquivo Maestro existente:
`.orquestrador-maestro/config.json` (com leitura legada de
`.orquestrador/maestro-config.json`). `interaction reset` remove somente a chave
`interactionProfile` e escreve atomicamente.

## Runtime

`workflow-state` continua sendo a única fonte de verdade. `ProgressProjection`
ordena as etapas pelo lock, deriva fase/current/next/completed e preserva gates,
approvals, blockers e evidências. Não existe `interaction-state.json` e nenhum
progresso é calculado por LLM.

```text
workflow-state + workflow-lock + run
                 │
                 ▼
        ProgressProjection (pura)
                 │
          CLI · TUI · adapters
```

`focus` injeta somente um contrato compacto em prompts gerenciados pelo Maestro;
CLIs executados diretamente continuam inalterados. Ausência de trabalho em
`status` retorna `idle` com sucesso. Contextos inferidos incluem `inferred: true`
e um aviso.

## Comandos

```bash
orquestrador-maestro interaction list
orquestrador-maestro interaction get
orquestrador-maestro interaction set focus
orquestrador-maestro interaction set focus --scope user
orquestrador-maestro interaction reset
orquestrador-maestro status --json
```

## Compatibilidade e rollback

O perfil padrão é pass-through. Para rollback, remova `interactionProfile` com
`interaction reset`; o restante da governança permanece intacto. Profiles
adicionais, alias `ux`, estimativas apresentadas ao usuário e interceptação de
CLIs nativos estão fora da v1.
