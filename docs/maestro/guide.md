# Guia completo do Maestro

Este guia explica o que mudou, como instalar, testar, configurar e reverter a camada de governança do Orquestrador Maestro.

## Resumo executivo

O Maestro é uma camada aditiva para quem continua usando o CLI favorito. Ele recomenda e governa regras de execução, mas não substitui provider, modelo, perfil ou tom nativos.

![Fluxo de decisão compatível](./assets/governance-flow.svg)

Com a configuração padrão:

- o tom atual é preservado;
- prompts existentes não recebem texto novo automaticamente;
- avisos são locais, determinísticos e limitados por sessão;
- hooks permanecem desligados;
- ausência de teste gera recomendação, não bloqueio;
- apenas risco crítico ou `strict` pode impedir uma conclusão;
- o usuário continua trabalhando diretamente no Codex, Claude, OpenCode, Cursor, Gemini ou outro CLI.

## O que esta mudança entrega

1. Governança compatível, com `compatibility` como padrão.
2. Configuração por projeto, sem exigir o Maestro em cada tarefa.
3. Diretório novo `.orquestrador-maestro`, mantendo leitura de instalações legadas em `.orquestrador`.
4. Avisos sobre verificação e evidência sem alterar automaticamente a resposta original.
5. Controle opt-in de rigor, frequência de avisos e hooks.
6. Benchmark v2 com cenários reproduzíveis, testes ocultos e gate de evidência.
7. Documentação e diagramas para custo, fluxo e impacto.

## Instalação e atualização

```bash
npm install -g @iapro/orquestrador-maestro-cli@latest
orquestrador-maestro install
orquestrador-maestro verify
```

Antes de uma atualização:

```bash
orquestrador-maestro update --dry-run
```

Em um clone do projeto:

```bash
bash install.sh --dry-run
bash install.sh
bash scripts/verify-install.sh
```

No Windows, use os equivalentes `.ps1` com `powershell -NoProfile -ExecutionPolicy Bypass`.

A atualização não renomeia automaticamente `.orquestrador`. Instalações existentes continuam válidas; novas instalações usam `.orquestrador-maestro`.

## Primeira verificação

```bash
orquestrador-maestro governance status --project-path .
```

O resultado esperado é semelhante a:

```json
{
  "mode": "compatibility",
  "tone": "preserved",
  "warningFrequency": "once-per-session",
  "hooks": { "enabled": false },
  "providerModel": "informational"
}
```

## Configuração recomendada

Na maioria dos casos, não é necessário configurar nada. Para registrar explicitamente a política do projeto:

```bash
orquestrador-maestro governance set --project-path . --mode compatibility
```

Para um projeto piloto com gates mais rígidos:

```bash
orquestrador-maestro governance set \
  --project-path . \
  --mode strict \
  --warning-frequency always \
  --hooks off
```

O comando grava `.orquestrador-maestro/config.json`. O CLI favorito continua sendo o ponto de execução da tarefa.

## Modelo mental

```text
CLI favorito → execução nativa → camada Maestro observa o resultado
                             ├─ recomendação
                             ├─ aviso
                             └─ bloqueio quando a política permitir
```

## Checklist de aceite

- [ ] `governance status` mostra `compatibility` e `tone: preserved`.
- [ ] O CLI favorito executa sem o comando `governance`.
- [ ] Nenhum provider ou modelo foi trocado automaticamente.
- [ ] Hooks continuam desligados, salvo ativação explícita.
- [ ] `npm test`, `npm run verify:pr` e `npm run bench:validate` passam.
- [ ] A instalação/atualização possui backup e rollback.
