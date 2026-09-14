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

A skill resolve Design Profile e metadata do design system na ordem abaixo:

1. configuração do projeto;
2. export público de pacote instalado;
3. índice ou metadata gerado pelo projeto;
4. schema neutro bundled pela própria skill.

Nenhum caminho absoluto, nome de repositório ou layout de workspace externo é necessário. O Visual QA é um smoke check de overflow, nomes acessíveis, contraste aproximado e erros de runtime; não substitui uma auditoria WCAG.

## Precedência

`skill-frontend-excellence` possui o processo e a Definition of Done. `skill-premium-web-experience` é o dono de sites cinematográficos de marketing; `skill-open-design-ui` cuida de direção visual; `skill-modern-ui-patterns` cuida de estados e interação; `skill-frontend-ux-guardrails` é o gate de usabilidade; `skill-webapp-testing` cobre jornadas E2E. `skill-impeccable` é reservado para polish focal.

O manifesto marca a skill como espelhável, e os sincronizadores devem ler esse sinal para todos os destinos declarados em `SKILL_INSTALL_POLICY.json`.
