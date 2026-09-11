# Integração opcional com ai-memory

Use esta integração somente se você precisa de memória longa adicional. O Maestro já oferece memória episódica e `DEV/`; esta camada não é requisito para instalar nem para trabalhar bem.

O Orquestrador Maestro possui um sistema de **memória episódica integrada** (JSONL, busca por branch/workspace/tarefa, promoção para DEV/, consolidação e retenção). O [ai-memory](https://github.com/akitaonrails/ai-memory) pode ser usado como camada opcional adicional para memória longa entre agentes. Isso não é requisito para instalar ou usar o Orquestrador.

## Divisão de responsabilidades

- **Memória episódica integrada**: Observações JSONL com escopo por branch, workspace e tarefa. Busca visível, consolidação, retenção e promoção para DEV/.
- **DEV/**: Guarda regras, specs, decisões aprovadas, handoff atual e evidências de verificação.
- **ai-memory** (opcional): Pode guardar observações sanitizadas, histórico de sessões, busca semântica e sugestões de consolidação.
- O agente nunca deve promover automaticamente uma sugestão externa para `AGENTS.md`, `DEV/SPECS/ACTIVE.md` ou uma decisão arquitetural.

## Fluxo recomendado

```text
sessão do agente
  → observação sanitizada e opt-in
  → briefing/handoff limitado
  → revisão humana ou do fluxo do projeto
  → atualização explícita de DEV/
```

Comece pelo modo local e sem LLM. Habilite hooks, embeddings ou servidor remoto somente depois de revisar a política de captura do projeto. O `ai-memory` documenta suporte a múltiplos clientes MCP e mantém Markdown como fonte de verdade, com SQLite como índice derivado. ([README](https://github.com/akitaonrails/ai-memory), [arquitetura](https://github.com/akitaonrails/ai-memory/blob/main/docs/ARCHITECTURE.md))

## O que não fazer

- não instalar como dependência obrigatória do pacote npm;
- não enviar prompts, tokens, logs ou arquivos privados sem consentimento explícito;
- não substituir a leitura de `DEV/HANDOFF.md` e `DEV/SPECS/ACTIVE.md` por busca semântica;
- não importar transcrições completas automaticamente;
- não copiar código ou prompts do repositório externo.

## Próximo passo

Implementar um adaptador documental e um smoke test opt-in conforme as RFCs [0001](rfcs/0001-contrato-de-memoria-entre-agentes.md), [0002](rfcs/0002-provider-de-memoria-ai-memory.md) e [0003](rfcs/0003-captura-e-privacidade-da-memoria.md).
