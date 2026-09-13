# Receitas operacionais

Uma receita é uma combinação orientada a resultado: define a ordem em que skills trabalham, o perfil de execução, o risco e a evidência esperada. Ela é uma recomendação declarativa; não concede autorização para ações externas, destrutivas ou de alto risco.

“Pacote” continua significando distribuição/instalação física. Consulte [pacotes de skills](../skill-packs.md) para essa parte e o [manifesto de receitas](../../orquestrador/SKILL_RECIPES.json) para a fonte estruturada.

## Receitas iniciais

| Receita | Sequência resumida | Perfil | Risco | Evidência mínima |
| --- | --- | --- | --- | --- |
| Construção segura de SaaS | `preflight` → `saas-factory` → limites/admin/pagamento conforme escopo → segurança → verificação | `saas` | alto quando há produção | critérios de aceite, testes, scan autorizado, diff e handoff |
| Frontend completo com Design Profile e Visual QA | `preflight` → `frontend-excellence` → `frontend-ux-guardrails` → `webapp-testing` → Visual QA | `standard` | médio | Design Profile, screenshots/baseline, pixel diff tolerado, contraste e testes |
| Investigação e correção sistemática | `repo-health` → `systematic-debugging` → implementação → `verification-before-completion` | `standard` | médio | reprodução, causa raiz, teste de regressão e diff |
| Pagamento e sincronização de entitlement | `saas-factory` → Stripe/AbacatePay → `saas-core-limits` → segurança → verificação | `deep` | alto | fluxo sandbox, webhook idempotente, estados, limites e reconciliação |
| Preparação de release | `preflight` → `release-engineering` → segurança → testes/smoke → verificação | `deep` | alto | changelog, artefato, smoke test, rollback e aprovação humana |
| Revisão de segurança | `preflight` → `saas-security-scan` ou `saas-dast-recon` → `quality-gate` → relatório | `security` | alto | autorização, escopo, saída do scan, findings e remediação |
| Processamento de mídia | ingestão live/manual → `smart-clip-detection` quando necessário → `watch-evidence` | `standard` ou `deep` | médio/alto | arquivo/stream, timestamps, transcrição e evidência visual |
| IA com observabilidade | `ai-orchestration` → `agent-observability` → segurança → verificação | `deep` | médio/alto | contrato de providers, orçamento, fallback, traces e testes |
| Pesquisa com fontes e decisão | `research-and-synthesis` → `doublecheck` quando disponível → `adr` | `standard` | baixo/médio | fontes, data, síntese comparável e decisão registrada |

## Como executar

1. Confirme o objetivo, o ambiente e o escopo autorizado.
2. Escolha a receita apenas se houver dependência entre duas ou mais frentes.
3. Leia o `SKILL.md` da skill principal e somente as referências necessárias.
4. Use as skills de apoio na ordem declarada; remova etapas que não se aplicam.
5. Pare quando faltar autorização, baseline ou ferramenta externa e registre a limitação.
6. Conclua somente com a evidência mínima da receita e do projeto.

Uma receita não substitui o roteamento. Se o pedido reconhecer uma skill específica ou uma cadeia já existente, preserve a intenção específica e use a receita como contexto de execução.
