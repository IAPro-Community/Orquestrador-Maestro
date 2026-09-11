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

O instalador deve preferir `.orquestrador-maestro` em instalações novas, preservar `.orquestrador` existente, não sobrescrever configuração nativa sem preview, manter hooks desligados e preservar perfil, provider, modelo e tom.

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
