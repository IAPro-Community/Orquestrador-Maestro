# Produto Maestro — fonte única de verdade

Este diretório é a fonte canônica da definição pública do produto.
Código e testes vencem documentação: tudo aqui precisa de evidência no repositório.

## Arquivos

| Arquivo | Papel |
|---|---|
| `CAPABILITY_MATRIX.json` | Matriz estruturada canônica (capabilities, tools, runtimeProviders). Validada por `tests/product-capability-matrix.test.js`. |
| `PRODUCT_SPEC.md` | Referência completa do produto (identidade, arquitetura, entidades, fluxo, capabilities comprovadas, limitações). |
| `PRODUCT_BRIEF.md` | Versão executiva (o que é, para quem, problema, funcionamento, diferenciais, começo). |
| `POSITIONING.md` | Categoria, tagline, proposta de valor, anti-positioning. |
| `USE_CASES.md` | Cenários reais com limites explícitos. |
| `GLOSSARY.md` | Definições formais dos conceitos do produto. |

## Regras

- `Compatible != Integrated != Runtime Provider` (ver `GLOSSARY.md`).
- Números (skills, cenários, providers) derivam dos manifests canônicos:
  `orquestrador/SKILLS_MANIFEST.json`, `orquestrador/PROGRAM_ENTRYPOINTS.json`,
  `orquestrador/TOOL_ADAPTERS.json`, `benchmark-harness/scenarios/`.
  Não copiar listas manualmente para outros documentos.
- Roadmap não é capability matrix: `ROADMAP.md` descreve plano; o que vale como
  capability atual está em `CAPABILITY_MATRIX.json` com `status: stable`.
- Claims quantitativos exigem benchmark válido (`benchmark-harness/`);
  exemplo ilustrativo deve estar marcado como ilustrativo.
- Telemetria remota é **opt-in desabilitada por padrão**
  (`bin/orquestrador-maestro.js: defaultTelemetryConfig`).
