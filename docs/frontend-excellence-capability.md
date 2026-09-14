# Capability: frontend-excellence

Maestro **não** implementa design tokens nem assume uma estrutura de monorepo.

Contrato:

```text
Maestro detecta tarefa frontend
        ↓
skill-frontend-excellence
        ↓
implementação
        ↓
Visual QA smoke harness
        ↓
Visual Reviewer
        ↓
PASS?  no → retry / rework
       yes → Definition of Done
```

Integração: `capabilityRoutes.frontend-excellence`, enriquecimento de `frontend-architecture`, manifesto, aliases, chains e índice. O roteador lê o manifest e expõe a skill sem código de runtime específico.

## Descoberta

A descoberta resolve o sistema na ordem de evidência abaixo:

1. instruções explícitas do projeto no escopo da tarefa;
2. `design-profile.json`, `design-profile.yaml` ou `design-profile.yml`, incluindo caminhos
   configurados em `frontendExcellence` ou metadados equivalentes;
3. imports coerentes no código;
4. dependência instalada somente como evidência insuficiente, nunca como resolução.

`taskScope` é analisado primeiro; evidência global só é consultada quando o escopo não tem
nenhum resultado. Conflitos ficam `ambiguous` e exigem decisão. Uma implementação nova só é
permitida quando o status é `resolved` e a confiança é `>= 0.80`; um único import, por
exemplo, permanece bloqueado com confiança `0.65`. O scanner é provider-neutral e não depende
de nome de biblioteca, Omnia ou layout de monorepo.

Nenhum caminho absoluto, nome de repositório ou layout de workspace externo é necessário. O Visual QA é um smoke check de overflow, nomes acessíveis, contraste aproximado e erros de runtime; não substitui uma auditoria WCAG.

## Precedência

`skill-frontend-excellence` possui o processo e a Definition of Done. `skill-premium-web-experience` é o dono de sites cinematográficos de marketing; `skill-open-design-ui` cuida de direção visual; `skill-modern-ui-patterns` cuida de estados e interação; `skill-frontend-ux-guardrails` é o gate de usabilidade; `skill-webapp-testing` cobre jornadas E2E. `skill-impeccable` é reservado para polish focal.

O manifesto marca a skill como espelhável, e os sincronizadores devem ler esse sinal para todos os destinos declarados em `SKILL_INSTALL_POLICY.json`.
