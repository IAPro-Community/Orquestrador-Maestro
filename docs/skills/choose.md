# Escolher uma skill por objetivo

Comece pela situação e ajuste pela evidência disponível no projeto. O perfil sugerido é um ponto de partida: o roteador pode escolher outro quando risco, escopo ou autorização exigirem.

Primeira vez? Faça o [exemplo guiado](primeira-skill.md) antes — ele mostra o ciclo completo com `skill-repo-health`.

| Situação | Skill principal | Skills de apoio | Perfil sugerido |
| --- | --- | --- | --- |
| Iniciar ou revisar um SaaS | `skill-saas-factory` | `skill-preflight`, `skill-saas-security-scan`, `skill-verification-before-completion` | `standard` ou `deep` |
| Criar frontend de produto | `skill-frontend-excellence` | `skill-frontend-ux-guardrails`, `skill-webapp-testing` | `standard` |
| Melhorar uma interface por screenshot ou referência | `skill-melhorar-ux-ui-por-referencia` | Apoio de frontend somente quando necessário | `fast` ou `standard` |
| Corrigir um bug difícil | `skill-systematic-debugging` | `skill-repo-health`, `skill-verification-before-completion` | `standard` |
| Preparar uma release | `skill-release-engineering` | `skill-saas-security-scan`, `skill-verification-before-completion` | `deep` |
| Integrar pagamentos | `skill-stripe-integration` ou `skill-abacatepay-integration` | `skill-saas-core-limits`, `skill-security-hooks`, `skill-verification-before-completion` | `deep` |
| Projetar uma integração de IA | `skill-ai-orchestration` | `skill-agent-observability`, `skill-security-hooks` | `deep` |
| Processar vídeo ou transmissão | `skill-live-processing` ou `skill-manual-video-processing` | `skill-smart-clip-detection`, `skill-watch-evidence` | `standard` ou `deep` |
| Investigar um repositório desconhecido | `skill-repo-health` | `skill-preflight`, `skill-deep-wiki` | `standard` |
| Fazer pesquisa com fontes | `skill-research-and-synthesis` | `skill-adr`, `skill-doublecheck` quando disponível | `standard` |

## Rotas em detalhe

### Construir ou revisar um SaaS

Funciona melhor quando há produto, autenticação, tenancy, dashboard, billing ou requisitos de produção. O `saas-factory` coordena a visão geral; acrescente limites, pagamentos, RLS, admin e segurança conforme o pedido. Se a tarefa for apenas uma tela, comece por `skill-frontend-excellence`; se for somente uma auditoria autorizada, use o scan específico.

Requisitos externos: repositório e critérios de aceite; serviços de pagamento, banco e cloud só quando realmente usados. Risco médio, podendo ficar alto com dados reais ou mudanças de infraestrutura. Resultado mínimo: escopo, mudança implementada, gates do projeto e evidência de testes/segurança.

### Criar frontend de produto

Use quando a tarefa exige descobrir ou preservar o design system do projeto, aplicar um Design Profile, cuidar de responsividade/acessibilidade e executar Visual QA. `frontend-ux-guardrails` é o apoio para regras de usabilidade; `modern-ui-patterns`, `open-design-ui` e `premium-web-experience` são capacidades diferentes para composição visual e direção de experiência. Para teste funcional amplo, acrescente `webapp-testing`.

Não use como substituto de uma auditoria de acessibilidade isolada ou como licença para introduzir um design system privado. Requisito externo: navegador e baseline quando houver Visual QA. Risco médio. Resultado mínimo: implementação, contraste/responsividade validados e relatório visual com limitações declaradas.

### Melhorar uma interface por referência

Use [skill-melhorar-ux-ui-por-referencia](reference/skill-melhorar-ux-ui-por-referencia.md)
para extrair hierarquia, cores, tipografia, espaçamentos, componentes e propostas
responsivas de screenshots. Ela distingue análise, geração de prompt e implementação
autorizada, sem impor uma API de visão.

O roteador textual reconhece frases como "melhore essa tela com base na referência"
e "compare estas telas"; ele não inspeciona anexos nem entende toda negação.
O assistente deve confirmar que a intenção e a imagem são de interface antes de
aplicar o fluxo. Uma imagem com "melhore isso" depende da interpretação contextual
do assistente, não de uma garantia de seleção pelo runtime.

A skill fica disponível sob demanda na fonte canônica; não exige espelhos nativos
em todas as ferramentas. Sem imagem ou renderização, declarar a limitação em vez
de prometer reprodução fiel. Fotos, anúncios e prints de terminal não são seu escopo.

### Investigar e corrigir

`systematic-debugging` é a rota para sintomas reproduzíveis, regressões e falhas de teste. Use `repo-health` quando a estrutura ou os comandos ainda forem desconhecidos. Se a causa envolver segurança, migração ou dependência, troque ou acrescente a skill especializada. Resultado mínimo: reprodução, hipótese testada, causa raiz, correção focada e verificação.

### Release e segurança

`release-engineering` organiza changelog, migração, smoke test, rollback e risco de publicação. `saas-security-scan` é para análise defensiva local; `saas-dast-recon` requer alvo autorizado de staging/preview. Uma revisão de segurança não substitui autorização nem permite atacar terceiros. Resultado mínimo: checklist executado, findings classificados, evidência e plano de rollback.

### Pagamentos e entitlements

Escolha Stripe ou AbacatePay pelo provedor realmente usado; não combine os dois apenas por conveniência. Acrescente `saas-core-limits` para planos, quotas e entitlements e valide webhooks idempotentes, estado local e reconciliação. Risco alto quando há dinheiro ou dados de produção. Resultado mínimo: fluxo de teste, estados documentados, webhook verificado e limites cobertos.

## Requisitos que mudam a rota

- **Autorização:** scans externos, mensagens, publicação, pagamentos e alterações destrutivas exigem autorização explícita e escopo verificável.
- **Ambiente:** skills de navegador, mídia, pagamentos e Google Workspace dependem de ferramentas/serviços disponíveis.
- **Baseline:** Visual QA e comparação de regressão devem falhar ou registrar limitação quando não houver referência confiável.
- **Idioma e intenção:** use frases completas e específicas. Termos curtos como `saas`, `ia` ou `whatsapp` não devem superar uma intenção mais precisa.

Para ver os metadados, risco e disponibilidade de cada rota, abra a [referência individual](reference/README.md).
