# Operação diária e troubleshooting

## Comandos essenciais

```bash
orquestrador-maestro governance status --project-path .
orquestrador-maestro verify
orquestrador-maestro doctor
```

Na TUI clássica, `g` mostra o estado e `g compatibility` ou `g strict` troca o modo do projeto atual.

## Avisos

`warningFrequency` aceita `once-per-session` (recomendado), `always` (diagnóstico/CI) e `never` (silêncio de avisos não bloqueantes).

```bash
orquestrador-maestro governance set --project-path . --warning-frequency always
```

## Configuração e precedência

O primeiro arquivo existente vence:

1. `.orquestrador/config.json` no projeto;
2. `.orquestrador/maestro-config.json` com nome de arquivo legado no projeto;
3. `.orquestrador-maestro/config.json` em raiz legada no projeto;
4. `~/.orquestrador/config.json`;
5. `~/.orquestrador/maestro-config.json` com nome de arquivo legado;
6. `~/.orquestrador-maestro/config.json` em raiz legada.

## Diagnóstico rápido

### O tom mudou

Confirme `tone: preserved`, volte para `compatibility` e desative qualquer contexto opt-in ou hook. O CLI nativo não deve receber prompt novo automaticamente.

### A tarefa foi bloqueada

```bash
orquestrador-maestro governance status --project-path .
orquestrador-maestro governance set --project-path . --mode compatibility
```

Depois revise critérios de aceite, verificação e evidências antes de reativar `strict`.

### O modelo parece diferente

O Maestro não deve trocar o modelo. Compare a configuração do CLI favorito e o provider efetivamente selecionado; `providerModel` é informativo.

### A raiz legada continua presente

Rode `orquestrador-maestro update`. O comando faz backup e reinstala automaticamente o núcleo na raiz canônica `.orquestrador` e migra memória e configuração de `.orquestrador-maestro`. Em seguida, rode `orquestrador-maestro verify` para validar a instalação. Para aplicar o snapshot diretamente, use `install.ps1` no Windows ou `bash install.sh` no Linux/macOS; os wrappers fazem backup por padrão.

### `validate` não funciona

O script chama PowerShell. Instale `pwsh` ou execute a validação Node equivalente e rode os scripts `.ps1` em Windows/CI.

## Rollback operacional

1. Preserve a saída de `governance status`.
2. Volte a `compatibility`.
3. Desative hooks.
4. Restaure somente arquivos gerenciados pelo Maestro a partir do backup.
5. Rode `verify` novamente.

Nunca apague recursivamente o home do usuário para corrigir uma instalação.
