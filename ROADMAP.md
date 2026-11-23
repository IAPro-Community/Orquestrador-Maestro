# Roadmap — Orquestrador Maestro

> Este documento descreve direção e trabalho planejado, não funcionalidades homologadas. A fonte para estados de capacidade é a [matriz do produto](docs/product/CAPABILITY_MATRIX.json). Concluir uma issue não substitui testes e evidências.

## Estado atual

A versão publicada é [1.1.1](https://github.com/IAPro-Community/Orquestrador-Maestro/releases/tag/v1.1.1); a linha 1.x evolui na branch `v1`. A base inclui CLI, instalação multiplataforma, Skills, routing, memória e mecanismos de verificação. Recursos experimentais não devem ser apresentados como disponíveis para produção.

## Prioridades abertas

| Prioridade | Tema | Critério principal |
| --- | --- | --- |
| P0 | [#67 — Goal Loop overnight](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/67) | Providers reais, recuperação e execução overnight comprovada |
| P0 | Estabilização da CI `v1` | Testes e gates multiplataforma íntegros |
| P1 | [#48 — Homologação do runtime](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/48) | Execução/recuperação E2E com evidências |
| P1 | [#44 — Linux e Claude Code](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/44) | Cenários reproduzíveis nos ambientes afetados |
| P2 | [#41 — API de memória](https://github.com/IAPro-Community/Orquestrador-Maestro/issues/41) | Contrato versionado, isolamento e testes |

Esta é uma proposta de prioridade, sem prazo ou promessa de entrega.

## Avaliações contínuas

- Benchmark A/B entre condições equivalentes, obedecendo ao [evidence gate](docs/benchmark.md), antes de publicar métricas.
- Compatibilidade real entre ferramentas, providers e plataformas, com fallback e diagnóstico explícitos.
- Privacidade, segurança da distribuição, testes e documentação para contribuidores.

## Acompanhamento

As [issues](https://github.com/IAPro-Community/Orquestrador-Maestro/issues) registram trabalho aberto. [CHANGELOG.md](CHANGELOG.md) e [releases](https://github.com/IAPro-Community/Orquestrador-Maestro/releases) documentam entregas realizadas. A [matriz de capacidades](docs/product/CAPABILITY_MATRIX.json) distingue estados `stable`, `experimental` e `planned`.

O histórico 0.x permanece no changelog e nas releases; não representa o foco da V1.
