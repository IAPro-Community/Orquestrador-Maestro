---
name: skill-frontend-ux-guardrails
description: Use as a frontend UX quality gate for responsive behavior, overflow, accessibility, interaction usability, touch targets, typography, layout stability, mobile behavior, focus states, reduced motion, and final visual validation.
category: frontend
risk: medium
source: local-product-ux-guardrails
---

# Skill Frontend UX Guardrails

Run this skill near the end of a frontend change, especially after a complex marketing experience, redesign, or interaction pass. It is a quality gate, not a replacement for experience strategy, visual direction, component implementation, or browser automation.

## Gate Order

1. Inspect the real rendered surface, routes, components, tokens, breakpoints, states, and test expectations.
2. State the primary user task and record P0/P1 issues before polish.
3. Fix layout stability and comprehension before visual refinement.
4. Validate desktop, laptop, tablet, and mobile behavior, including long realistic content.
5. Check keyboard, focus, labels, contrast, touch targets, reduced motion, and non-pointer use.
6. Run the lightest meaningful lint, typecheck, build, targeted test, browser, or screenshot gate available.
7. Report tested viewports, corrected issues, and residual risk.

## Quality Rubric

Score the target from 0 to 4 for hierarchy, contrast, responsiveness, accessibility, performance, interaction usability, and visual integrity. Resolve P0/P1 findings before delivery. Defer P2/P3 refinements only when they do not affect the requested task or the primary user path.

## Responsive And Layout

- Verify `320x568`, `390x844`, `768x1024`, `1024x768`, and `1440x900` or a representative desktop width.
- At `320px`, check button wrapping, text clipping, tables, dialogs, sticky areas, and bottom bars.
- At tablet widths, check sidebars, drawers, charts, grids, and action collisions.
- At desktop widths, prevent unreadable line lengths, sparse accidental grids, and stretched media.
- Test long names, emails, plan labels, currencies, percentages, error messages, and localized values.
- Check page-level overflow, duplicate scrollbars, wrapping, sticky offsets, z-index collisions, layout shift, and safe areas.
- Do not require horizontal scrolling for core comprehension. If a table must scroll, keep its context, labels, and actions usable.

## Accessibility And Interaction

- Require semantic HTML, logical keyboard order, visible focus states, accessible names, sufficient contrast, readable text, and usable touch targets.
- Verify loading, empty, no-results, error, disabled, success, pending, selected, validation, and destructive-confirmation states where relevant.
- Do not hide critical actions only on hover or require color, animation, or pointer input to understand content.
- Include and test `@media (prefers-reduced-motion: reduce)`; simplify or disable non-essential motion without losing meaning.
- Confirm forms preserve user input after errors and that dialogs, menus, popovers, and table actions are dismissible and keyboard-accessible.

## Visual Integrity

Inspect screenshots or browser snapshots when changing layout, typography, navigation, charts, modals, sticky behavior, or motion. Check hierarchy, line breaks, clipping, overlap, blank canvases, invisible text, icon alignment, contrast, layout shift, and animation glitches. Compare before/after for redesigns or visual cleanup.

## Generated-UI Smells

Flag generic gradients, gratuitous glassmorphism or glow, side-accent cards, nested cards, flat hierarchy, one-font-everywhere treatment, giant icon tiles, redundant helper copy, and modal abuse. Keep an intentional pattern only when the product, content, or experience strategy explains it. Use `skill-open-design-ui` for visual-system changes and `skill-impeccable` for focused polish; do not expand a layout fix into an unrequested redesign.

## Completion Criteria

- No unintended page-level horizontal overflow.
- Desktop and mobile are intentionally designed and stable.
- Primary actions, system states, and recovery paths are clear.
- Focus, contrast, touch, reduced motion, spelling, accents, and UTF-8 are safe.
- Existing routes, forms, analytics, and behavior are preserved unless explicitly changed.
- The rendered result, not only the source or build, was verified.

## Related Skills

- `skill-premium-web-experience` — final gate for complex premium web experiences.
- `skill-open-design-ui` — visual direction, tokens, and visual QA.
- `skill-modern-ui-patterns` — components and interaction states.
- `skill-impeccable` — bounded critique and polish.
- `skill-webapp-testing` — E2E or visual regression when a flow changes.
