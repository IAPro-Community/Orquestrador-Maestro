# Impacto para o usuário final

## O que não deve mudar

- comandos habituais do CLI favorito;
- modelo, provider e perfil escolhidos;
- tom e estilo das respostas;
- tarefas válidas que não têm testes automatizados;
- arquivos nativos já existentes;
- memória, sessões e logs de terceiros.

## Possíveis impactos residuais

| Risco | Sintoma | Mitigação |
| --- | --- | --- |
| aviso novo | recomendação após uma tarefa | `once-per-session`, `never` ou revisão da política |
| gate rigoroso | conclusão bloqueada em `strict` | voltar para `compatibility` ou ajustar critérios |
| hook inesperado | ação local extra | manter hooks desligados |
| arquivo de configuração | novo `.orquestrador-maestro/config.json` | revisar e versionar apenas se desejado |
| instalação legada | arquivos continuam em `.orquestrador` | não renomear automaticamente |
| custo de contexto | prompt maior em `strict`/opt-in | manter compatibilidade e medir antes |
| plataforma | PowerShell ausente | usar validação Node e CI/Windows |

## Estratégia de redução de dano

1. Começar em `compatibility`.
2. Fazer dry-run antes de instalar ou atualizar.
3. Inspecionar `governance status` depois da instalação.
4. Não ativar hooks na primeira atualização.
5. Testar `strict` em projeto piloto.
6. Manter backup e rollback disponíveis.

## Reverter a política

```bash
orquestrador-maestro governance set --project-path . --mode compatibility
orquestrador-maestro governance set --project-path . --hooks off
```

A reversão não remove arquivos do usuário nem altera configurações nativas.

## Critério de melhoria sem regressão

Uma release não deve virar padrão se introduzir mudança de tom, troca automática de modelo, bloqueio de tarefa anteriormente válida, aumento obrigatório de prompt ou hook não solicitado.
