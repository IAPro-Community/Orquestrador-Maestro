# Como testar

## Pré-requisitos

- Node.js 20 ou superior para desenvolvimento e execução do pacote atual.
- npm disponível no PATH.
- PowerShell para executar os validadores `.ps1`.
- API keys não são necessárias para os testes locais.

## Teste do repositório

Na raiz do clone:

```bash
npm install
npm test
npm run test:smoke
npm run verify:pr
npm run bench:validate
npm pack --dry-run
```

| Comando | Objetivo |
| --- | --- |
| `npm test` | suíte completa de unidades e integração |
| `npm run test:smoke` | caminhos críticos curtos |
| `npm run verify:pr` | higiene pública, referências e arquivos gerados |
| `npm run bench:validate` | schema e fixtures dos seis cenários |
| `npm pack --dry-run` | conteúdo que entrará no pacote npm |

## Verificação de sintaxe

```bash
find bin runtime benchmarks scripts orquestrador \
  -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -print0 \
  | xargs -0 -n1 node --check
```

## Teste funcional da governança

```bash
node bin/orquestrador-maestro.js governance status --project-path .
node bin/orquestrador-maestro.js governance set --project-path . --mode strict
node bin/orquestrador-maestro.js governance status --project-path .
node bin/orquestrador-maestro.js governance set --project-path . --mode compatibility
```

Não use `strict` como política permanente sem revisar o impacto.

## Teste do pacote real

```bash
pkg_tmp=$(mktemp -d)
install_tmp=$(mktemp -d)
npm pack --pack-destination "$pkg_tmp"
npm install --ignore-scripts --no-audit --no-fund \
  --prefix "$install_tmp" "$pkg_tmp"/*.tgz
node "$install_tmp/node_modules/@iapro/orquestrador-maestro-cli/bin/orquestrador-maestro.js" \
  governance status --project-path "$install_tmp"
node "$install_tmp/node_modules/@iapro/orquestrador-maestro-cli/bin/orquestrador-maestro.js" \
  benchmark list
```

Esse teste confirma que o artefato publicado contém runtime, harness e CLI executável.

## Benchmark com provider real

```bash
node benchmarks/cli.js list
node benchmarks/cli.js validate bug-fix-auth
node benchmarks/cli.js run bug-fix-auth --model anthropic/claude-sonnet-4-20250514
```

O benchmark de fixtures não chama IA. Execuções reais exigem OpenCode configurado, variam por modelo e não devem publicar chaves, logs ou resultados locais.

## Critério de conclusão

A mudança só deve ser considerada pronta quando suíte, validação pública, benchmarks e empacotamento passarem. Se `pwsh` não existir, execute os scripts PowerShell em Windows ou CI e registre a limitação.
