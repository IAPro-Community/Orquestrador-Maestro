# RFCs do Orquestrador Maestro

RFC significa *Request for Comments*. Neste projeto, uma RFC registra uma proposta que ainda está aberta para discussão. Ela não é uma decisão final.

## Fluxo

```text
RFC proposta → revisão → decisão aprovada → ADR → implementação → verificação
```

Use uma RFC quando a mudança puder afetar mais de uma ferramenta, o contrato de memória, a segurança, a compatibilidade, o instalador ou a arquitetura. Para ajustes pequenos e locais, uma issue ou um PR bem descrito é suficiente.

Quando a proposta for aceita, registre a decisão em `DEV/ADR/` no projeto de origem ou em `DEV/DECISIONS.md` quando o contexto exigir apenas um resumo. A RFC original deve permanecer com status `Accepted` e apontar para a decisão.

## Status permitidos

- `Draft`: proposta inicial, ainda incompleta.
- `Review`: pronta para comentários.
- `Accepted`: aprovada para implementação.
- `Rejected`: analisada e não adotada, com motivo registrado.
- `Superseded`: substituída por outra RFC.
- `Implemented`: implementada e verificada.

## Conteúdo mínimo

1. Problema e motivação.
2. Objetivos e não objetivos.
3. Proposta.
4. Alternativas consideradas.
5. Compatibilidade e migração.
6. Segurança, privacidade e reversibilidade.
7. Critérios de aceite e métricas.
8. Decisão, responsáveis e próximos passos.

As RFCs deste diretório documentam direção pública do pacote. Não inclua logs, sessões, memórias locais, credenciais ou conteúdo privado de projetos.

## RFCs atuais

- [RFC-0001: Contrato de memória entre agentes](0001-contrato-de-memoria-entre-agentes.md) — `Review`.
- [RFC-0002: Provider opcional baseado em ai-memory](0002-provider-de-memoria-ai-memory.md) — `Review`.
- [RFC-0003: Captura e privacidade da memória](0003-captura-e-privacidade-da-memoria.md) — `Review`.
- [RFC-0004: Execution Runtime aditivo para o Maestro](0004-execution-runtime-additivo.md) — `Accepted`.
