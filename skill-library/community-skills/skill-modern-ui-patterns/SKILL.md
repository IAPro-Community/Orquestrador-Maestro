---
name: skill-modern-ui-patterns
description: Use for professional frontend UI implementation with modern component composition, interaction states, forms, tables, cards, navigation, dashboards, SaaS surfaces, and maintainable design-system consistency.
category: frontend
risk: low
source: local-saas-ui-patterns
---

# Skill Modern UI Patterns

Use this skill for the implementation layer of product interfaces. Adapt the patterns to the project’s existing framework, component model, and styling tools; do not assume React, Tailwind, or TypeScript when the repository uses another stack.

For a premium marketing or branding experience, use `skill-premium-web-experience` first and `skill-open-design-ui` for the visual system. This skill owns component composition, behavior, states, and product UI ergonomics, not complete art direction or narrative strategy.

## Scope

Specialize in:

- component composition and design-system consistency;
- modern UI patterns for forms, tables, cards, navigation, dashboards, settings, billing, and onboarding;
- loading, empty, no-results, error, success, pending, selected, disabled, hover, focus, and destructive-confirmation states;
- responsive behavior that preserves task flow and readable density.

## Workflow

1. Inspect the real routes, shell, primitives, tokens, icons, data-loading conventions, breakpoints, and tests before editing.
2. Identify the user workflow: scan, filter, compare, act, confirm, recover.
3. Choose the smallest composition that supports that workflow and reuse existing primitives.
4. Implement realistic content and all states touched by the change, including long labels and partial failures.
5. Preserve URLs, form semantics, analytics, permissions, keyboard behavior, and server contracts.
6. Validate at mobile, tablet, and desktop sizes; run the available lint, typecheck, build, targeted tests, and browser checks.

## Component Patterns

- Use text or icon-plus-text buttons when the consequence must be explicit; use icon buttons only for familiar compact tools with accessible labels.
- Use drawers for contextual detail, dialogs for blocking decisions, popovers for lightweight controls, and pages for durable workflows.
- Keep cards shallow. Do not place every page section in a card or nest cards without a clear grouping reason.
- Keep page title, freshness, primary action, and key filters easy to find.
- Use metric cards only for decision-making numbers, with units, period, source, or caveat when needed.
- Prefer one strong chart or table cluster over many decorative cards.

## Forms

- Validate at the field, summarize submission failures, and preserve user input after errors.
- Mark required fields according to the project convention and explain ambiguous values with useful examples.
- Provide submitting, saved, validation-error, unavailable, and retry states.
- Keep destructive actions confirmable and auditable; show what will be affected.

## Tables And Lists

- Keep headers, row actions, sorting, filtering, pagination, selection, and detail expansion consistent with existing screens.
- Provide a useful empty state with one clear next action when possible.
- Prioritize columns on narrow screens and preserve primary identifiers and actions.
- Keep legends, tooltips, status language, and units readable at small widths.

## Responsive And Accessibility

Do not treat mobile as a stacked desktop layout. Define intentional changes for navigation, controls, density, tables, drawers, and dialogs. Verify `320x568`, `390x844`, `768x1024`, `1024x768`, and a representative desktop width. Use semantic elements, keyboard navigation, visible focus, accessible names, sufficient contrast, usable touch targets, and content that remains understandable without motion.

## Anti-Generic Quality

Prefer purposeful hierarchy and restraint. Avoid generic gradients, excessive roundness, glass cards, nested cards, oversized icon containers, repetitive section kickers, one undifferentiated font, decorative glow, and motion without meaning unless an existing product system explicitly justifies them. Keep copy specific, correctly spelled, and UTF-8 safe.

## Related Skills

- `skill-premium-web-experience` — full marketing/brand experience strategy, narrative, conversion, and coordination.
- `skill-open-design-ui` — visual direction, tokens, component system, and visual QA.
- `skill-frontend-ux-guardrails` — final responsive, accessibility, overflow, and usability gate.
- `skill-impeccable` — focused critique or polish when the current surface feels generic or unfinished.
