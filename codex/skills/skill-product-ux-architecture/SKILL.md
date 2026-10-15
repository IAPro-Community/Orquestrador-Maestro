---
name: skill-product-ux-architecture
description: Plan the UX architecture of an entire product or application across screens, navigation, journeys, states, responsive behavior, information architecture, and design-system needs before implementation.
category: frontend
risk: medium
source: orquestrador-native
---

# Product UX Architecture

Use this skill when the problem is larger than one screen. It owns the structure of the product experience before visual polish or component implementation.

## Own

- information architecture and navigation model;
- screen and route inventory;
- primary and secondary user journeys;
- cross-screen consistency;
- global shell, hierarchy, progressive disclosure, and density;
- loading, empty, error, permission, offline, success, destructive, and recovery states across the product;
- responsive strategy by surface, not only breakpoint stacking;
- design-system gaps discovered from product needs;
- UX debt and sequencing of redesign work.

## Do Not Own

- final visual language and art direction: use `skill-open-design-ui`;
- implementation details of tables/forms/components: use `skill-modern-ui-patterns`;
- final accessibility/responsive QA: use `skill-frontend-ux-guardrails`;
- localized polish of an existing screen: use `skill-impeccable`;
- cinematic marketing websites: use `skill-premium-web-experience`.

## Workflow

1. Inspect real routes, roles, navigation, existing screens, analytics boundaries, design-system primitives, mobile behavior, and known product constraints.
2. Identify personas/roles only from available evidence; do not invent user research.
3. Build a screen/route inventory grouped by user goal rather than by implementation folder.
4. Map the critical journeys end-to-end. Include entry, decision points, interruptions, error recovery, permissions, success, and next action.
5. Define the global information architecture, navigation rules, hierarchy, content density, and shared shell.
6. Define each major surface by purpose: user question, primary action, secondary actions, key information, states, and dependencies.
7. Specify cross-product rules for forms, lists, tables, search, filters, drawers, dialogs, notifications, status language, and empty states.
8. Define intentional desktop/tablet/mobile changes and identify flows that need a different mobile interaction model.
9. Produce a migration sequence that minimizes simultaneous UX and engineering risk.
10. Hand visual-system work to `skill-open-design-ui` and implementation to the appropriate frontend skill.

## Design Intelligence

When the project already has a design catalog, pattern library, screenshots, Figma/Pencil artifacts, analytics, or an installed design-search tool, query only the slices needed for the current product type, flow and platform. Do not bulk-load style catalogs or trend databases into context.

Use references to answer concrete questions such as:

- which navigation pattern fits the information depth;
- what density/state model is appropriate for this product type;
- which existing component or layout pattern should remain consistent;
- which visual directions conflict with the current design system;
- what mobile interaction model is already established.

Reference material informs decisions; it does not override product constraints, accessibility, existing design-system contracts, or observed user flows.

## Required Output

Produce:

- product UX map;
- route/screen inventory;
- navigation model;
- critical-journey map;
- shared state matrix;
- responsive strategy;
- design-system gaps;
- prioritized UX backlog;
- explicit non-goals and unresolved decisions.

## Guardrails

- Do not redesign every screen merely because the product is inconsistent.
- Do not turn navigation into a feature list; organize it around user goals.
- Do not hide important actions only to make the interface visually minimal.
- Do not assume mobile can be solved by stacking desktop sections.
- Do not invent user needs, research findings, conversion metrics, or business rules.
- Prefer one coherent system over per-screen creativity.

## Verification

A plan is ready only when a developer/designer could implement multiple screens without independently re-deciding navigation, hierarchy, states, responsive behavior, and terminology for each one.

## Related Skills

- `skill-frontend-excellence`
- `skill-open-design-ui`
- `skill-modern-ui-patterns`
- `skill-frontend-ux-guardrails`
- `skill-impeccable`
