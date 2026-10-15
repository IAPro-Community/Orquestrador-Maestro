# Atualização segura e rollback

## Antes da atualização

```bash
node --version
npm --version
orquestrador-maestro verify
orquestrador-maestro governance status --project-path .
orquestrador-maestro update --dry-run
```

Guarde cópia dos arquivos gerenciados antes de uma migração relevante.

## Garantias esperadas

O instalador deve usar `.orquestrador` como raiz única, manter `.orquestrador-maestro` apenas como caminho de leitura/migração, criar backup antes da consolidação, preservar memória e configuração e manter hooks, provider, modelo e tom do usuário.

## Depois da atualização

```bash
orquestrador-maestro verify
orquestrador-maestro governance status --project-path .
```

Teste uma tarefa pequena usando o CLI habitual antes de continuar trabalho crítico.

## Rollback

O rollback restaura arquivos gerenciados pelo Maestro a partir do backup correspondente. Não remove memória, sessões, logs, configurações nativas ou diretórios de outras ferramentas.

Se o problema for somente política:

```bash
orquestrador-maestro governance set --project-path . --mode compatibility --hooks off
```

Nunca use `rm -rf` em um diretório amplo ou não confirmado.

| Situação | Ação |
| --- | --- |
| aviso inesperado | revisar frequência e critérios |
| bloqueio em projeto comum | voltar para `compatibility` |
| mudança de tom | confirmar prompt nativo e desativar contexto opt-in |
| instalação incompleta | restaurar backup e executar `verify` |
| falha no PowerShell | executar em Windows/CI com PowerShell |
