<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# Catálogo de skills

Este catálogo compacto é gerado a partir de [`orquestrador/SKILLS_MANIFEST.json`](../orquestrador/SKILLS_MANIFEST.json). Para orientação, consulte o [portal de skills](skills/README.md); para detalhes, abra a [referência individual](skills/reference/README.md).

Total: 52

Atualize e valide este catálogo com `node scripts/skill-catalog.js generate`, `check` e `validate` (ou `orquestrador-maestro skill-catalog <comando>`).

| Skill | Categoria | Risco | Disponibilidade | Resumo |
| --- | --- | --- | --- | --- |
| [skill-abacatepay-integration](skills/reference/skill-abacatepay-integration.md) | payments | medium | Sob demanda | AbacatePay PIX/card billing, CPF/CNPJ, BRL checkout, billing webhooks, and entitlement sync. |
| [skill-adr](skills/reference/skill-adr.md) | architecture | low | Nativa | Registros de decisões arquiteturais com alternativas e consequências. |
| [skill-agent-observability](skills/reference/skill-agent-observability.md) | observability | medium | Sob demanda | Observabilidade de agentes, custos, latência, qualidade e regressões. |
| [skill-ai-orchestration](skills/reference/skill-ai-orchestration.md) | ai | medium | Nativa | Server-side AI provider orchestration, routing, budgets, fallbacks, observability, and safe key handling. |
| [skill-aionui-cowork-orchestration](skills/reference/skill-aionui-cowork-orchestration.md) | orchestration | medium | Sob demanda | Safe AionUi cowork/team integration around Codex, Claude, Gemini, OpenCode, MCPs, and the user orchestrator without replacing the existing workflow. |
| [skill-browser-agent](skills/reference/skill-browser-agent.md) | automation | medium | Sob demanda | Reliable web-browser agents using semantic page state, accessibility-tree inspection, structured Playwright actions, post-action validation, replay, and bounded visual fallbacks. |
| [skill-cobranca-automatizada-saas-abacatepay](skills/reference/skill-cobranca-automatizada-saas-abacatepay.md) | payments | high | Sob demanda | Automatic SaaS billing engine with AbacatePay (PIX + card), dunning (regua de cobranca), trial management, invoice portal, Resend email and Evolution API WhatsApp notifications, admin CRUD, and billing metrics. |
| [skill-database-migrations](skills/reference/skill-database-migrations.md) | database | high | Sob demanda | Migrações de banco seguras, compatíveis, idempotentes e verificáveis. |
| [skill-deep-wiki](skills/reference/skill-deep-wiki.md) | documentation | low | Sob demanda | Documentação técnica navegável com arquitetura, Mermaid e onboarding. |
| [skill-dependency-upgrade](skills/reference/skill-dependency-upgrade.md) | maintenance | medium | Sob demanda | Atualização controlada de dependências e lockfiles. |
| [skill-doublecheck](skills/reference/skill-doublecheck.md) | verification | medium | Sob demanda | Verifica afirmações, fontes e risco de alucinação em respostas, pesquisas e documentos, com modo pontual ou contínuo. |
| [skill-elevenlabs-voice-cloning](skills/reference/skill-elevenlabs-voice-cloning.md) | ai | high | Sob demanda | ElevenLabs voice generation/cloning integration with consent, asset handling, and server-side API use. |
| [skill-evolution-api](skills/reference/skill-evolution-api.md) | communication | medium | Sob demanda | Evolution API WhatsApp integration with webhook idempotency, queueing, consent, and rate limits. |
| [skill-frontend-excellence](skills/reference/skill-frontend-excellence.md) | frontend | medium | Nativa | Use for product frontend work: classify intent, discover the project's design system and Design Profile, preserve or evolve UI, run Visual QA, and refuse to mark frontend done from build-only evidence. |
| [skill-frontend-ux-guardrails](skills/reference/skill-frontend-ux-guardrails.md) | frontend | medium | Sob demanda | Frontend UX quality gate for responsive behavior, overflow, accessibility, interaction usability, touch targets, typography, layout stability, mobile behavior, focus states, reduced motion, and final visual validation. |
| [skill-google-workspace-sync](skills/reference/skill-google-workspace-sync.md) | integrations | medium | Sob demanda | Google Workspace sync patterns for Drive/Sheets/Calendar data, OAuth scopes, webhooks, and reconciliation. |
| [skill-impeccable](skills/reference/skill-impeccable.md) | frontend | medium | Sob demanda | Focused frontend critique and polish for interfaces that feel generic, amateur, unclear, inaccessible, or unfinished, with bounded routing to visual-system, component, and UX quality skills. |
| [skill-incident-response](skills/reference/skill-incident-response.md) | operations | high | Sob demanda | Resposta a incidentes, contenção, recuperação e postmortem. |
| [skill-lgpd-brasil](skills/reference/skill-lgpd-brasil.md) | compliance | high | Sob demanda | LGPD-focused privacy and data-governance skill for Brazilian software products. Use for data mapping, legal basis selection, consent, privacy notices, RIPD, rights requests, retention, vendor risk, incident response, and international transfer review. |
| [skill-live-processing](skills/reference/skill-live-processing.md) | media | medium | Sob demanda | Live media processing pipeline with capture, queueing, worker state, retries, and observability. |
| [skill-manual-video-processing](skills/reference/skill-manual-video-processing.md) | media | medium | Sob demanda | Manual upload video processing with secure storage, validation, job states, and retryable workers. |
| [skill-mcp-builder](skills/reference/skill-mcp-builder.md) | integrations | high | Sob demanda | Construção segura de MCP servers tipados e testáveis. |
| [skill-melhorar-ux-ui-por-referencia](skills/reference/skill-melhorar-ux-ui-por-referencia.md) | frontend | low | Sob demanda | Melhorar interfaces por screenshots/referências; separar análise, prompt e implementação autorizada. Confirmar o contexto visual após a seleção textual. |
| [skill-modern-ui-patterns](skills/reference/skill-modern-ui-patterns.md) | frontend | low | Sob demanda | Professional frontend UI implementation with modern component composition, interaction states, forms, tables, cards, navigation, dashboards, SaaS surfaces, and maintainable design-system consistency. |
| [skill-multiagent-orchestration](skills/reference/skill-multiagent-orchestration.md) | orchestration | medium | Nativa | Multiagent and subagent orchestration for splitting independent engineering work, assigning ownership, reducing token waste, and integrating results safely. |
| [skill-open-design-ui](skills/reference/skill-open-design-ui.md) | frontend | low | Sob demanda | Frontend visual-system workflow for design direction, tokens, component patterns, responsive UI, anti-generic decisions, and visual QA after experience strategy is clear. |
| [skill-optimize-images](skills/reference/skill-optimize-images.md) | media | low | Sob demanda | Otimiza imagens para blogs e sites, incluindo conversão de formato, redimensionamento, compressão, responsividade, acessibilidade e validação visual. Use quando pedirem para otimizar, reduzir, preparar, converter ou melhorar imagens para web. |
| [skill-preflight](skills/reference/skill-preflight.md) | workflow | medium | Nativa | Preflight de escopo, baseline, riscos, ownership e testes. |
| [skill-premium-web-experience](skills/reference/skill-premium-web-experience.md) | frontend | low | Sob demanda | Use for creating, redesigning, or transforming websites into premium, cinematic, conversion-focused web experiences with visual research, storytelling, scroll-driven interaction, responsive design, motion, performance, accessibility, and visual QA. |
| [skill-quality-gate](skills/reference/skill-quality-gate.md) | governance | high | Nativa | Avalia skills, plugins e MCPs antes da adoção. |
| [skill-release-engineering](skills/reference/skill-release-engineering.md) | delivery | high | Nativa | Engenharia de release, smoke tests, rollback e checklist operacional. |
| [skill-repo-health](skills/reference/skill-repo-health.md) | engineering | medium | Nativa | Diagnóstico de saúde, stack, verificação e riscos de repositórios. |
| [skill-research-and-synthesis](skills/reference/skill-research-and-synthesis.md) | research | low | Nativa | Pesquisa web rastreável, comparável e baseada em fontes primárias. |
| [skill-saas-admin-dashboard](skills/reference/skill-saas-admin-dashboard.md) | saas | medium | Sob demanda | SaaS admin dashboard and internal panel patterns for users, plans, payments, logs, metrics, settings, and onboarding. |
| [skill-saas-core-limits](skills/reference/skill-saas-core-limits.md) | saas | medium | Sob demanda | SaaS plan limits, quotas, entitlements, feature flags, trials, grace periods, and blocked account states. |
| [skill-saas-dast-recon](skills/reference/skill-saas-dast-recon.md) | security | high | Sob demanda | Authorized staging/preview DAST and recon workflow for owned SaaS systems. |
| [skill-saas-factory](skills/reference/skill-saas-factory.md) | saas | medium | Nativa | Top-level SaaS construction and review workflow for dashboards, admin, Supabase, payments, security, infra, and production readiness. |
| [skill-saas-security-scan](skills/reference/skill-saas-security-scan.md) | security | high | Nativa | Authorized local SaaS repository security scan using maintained OSS tools. |
| [skill-scope-control](skills/reference/skill-scope-control.md) | governance | medium | Sob demanda | Analisa se alterações, diffs e PRs continuam alinhados ao objetivo declarado, identificando escopo extra e propondo manter, separar ou justificar. |
| [skill-security-hooks](skills/reference/skill-security-hooks.md) | security | medium | Sob demanda | Git hooks and CI security gates for SaaS repositories. |
| [skill-skill-development](skills/reference/skill-skill-development.md) | governance | medium | Sob demanda | Cria, revisa e melhora skills do Orquestrador com gatilhos claros, divulgação progressiva, referências focadas, validação e testes de comportamento. |
| [skill-smart-clip-detection](skills/reference/skill-smart-clip-detection.md) | media | medium | Sob demanda | Smart clip candidate detection for video/audio using scored moments, metadata, and review workflows. |
| [skill-stripe-integration](skills/reference/skill-stripe-integration.md) | payments | medium | Sob demanda | Stripe Checkout, Billing subscriptions, customer portal, webhook verification, and SaaS entitlement sync. |
| [skill-supabase-rls](skills/reference/skill-supabase-rls.md) | security | high | Sob demanda | Supabase/Postgres RLS design, tenant isolation, policies, indexes, and verification. |
| [skill-systematic-debugging](skills/reference/skill-systematic-debugging.md) | engineering | medium | Nativa | Debugging sistemático orientado por evidência e causa raiz. |
| [skill-threat-modeling](skills/reference/skill-threat-modeling.md) | security | high | Sob demanda | Conduz threat modeling estruturado com STRIDE-A, fluxos de dados, fronteiras de confiança, riscos priorizados e comparação incremental. |
| [skill-unified-analytics](skills/reference/skill-unified-analytics.md) | analytics | medium | Sob demanda | Unified SaaS/product analytics event taxonomy, metrics, funnels, dashboards, and privacy guardrails. |
| [skill-verification-before-completion](skills/reference/skill-verification-before-completion.md) | quality | low | Nativa | Verificação proporcional antes de declarar conclusão. |
| [skill-watch-evidence](skills/reference/skill-watch-evidence.md) | media | high | Sob demanda | Video, audio, screen-recording, and visual-flow analysis with persistent indexes, timestamped evidence, OCR/transcription, and deterministic verification. |
| [skill-web-clone](skills/reference/skill-web-clone.md) | frontend | medium | Sob demanda | Clonagem de uma página web por URL com extração de estrutura, reprodução visual, interações essenciais e verificação no navegador. |
| [skill-webapp-testing](skills/reference/skill-webapp-testing.md) | testing | medium | Nativa | Testes web E2E, acessibilidade, estados e regressão visual. |
| [skill-whatsapp-meta-ads-leads](skills/reference/skill-whatsapp-meta-ads-leads.md) | marketing | low | Sob demanda | Configura campanhas de WhatsApp no Meta Ads para gerar leads qualificados para negócios locais. |
