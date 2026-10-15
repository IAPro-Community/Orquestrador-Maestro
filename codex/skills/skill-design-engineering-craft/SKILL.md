---
name: skill-design-engineering-craft
description: High-fidelity design engineering for the implementation details that make an interface feel deliberate and expensive: optical alignment, type rhythm, density, surfaces, state fidelity, responsive detail, and component finish.
category: frontend
risk: low
source: orquestrador-native
---

# Design Engineering Craft

Use after the product structure and visual direction are sufficiently clear. This is an implementation-craft skill, not a redesign generator.

## Own

- optical alignment and visual balance;
- typography rhythm, line-height, measure, weights, labels, and numerical alignment;
- spacing rhythm and density;
- border, radius, divider, shadow, elevation, and surface hierarchy;
- icon sizing, stroke, baseline, and icon-text relationships;
- control geometry, hit areas, row heights, field rhythm, and button composition;
- realistic component states and microcopy;
- responsive details that commonly make otherwise-correct UIs feel unfinished;
- consistency between CSS/design tokens and the rendered surface.

## Do Not Own

- app-wide IA/journey planning: use `skill-product-ux-architecture`;
- new art direction/design language: use `skill-open-design-ui`;
- audit-only critique: use `skill-impeccable`;
- motion-system decisions: use `skill-motion-design-principles`.

## Craft Pass

1. Capture or inspect the rendered baseline before changing code.
2. Identify the visual hierarchy and the elements that must visually align even when their boxes do not mathematically align.
3. Check type roles, cap-height relationships, number alignment, truncation, wrapping, and long/localized strings.
4. Normalize spacing around relationships, not arbitrary multiples. Distinguish intra-component, inter-component, section, and page spacing.
5. Audit surfaces: avoid too many elevations, nested cards, unnecessary borders, washed-out text, and inconsistent radii.
6. Inspect icons and controls at real size. Correct optical centering, stroke mismatch, text/icon gaps, and touch targets.
7. Review every affected state: default, hover, focus-visible, active, selected, disabled, loading, empty, error, success, pending.
8. Validate representative mobile/tablet/desktop widths and realistic data.
9. Prefer existing tokens. If a new token is necessary, make it semantic and reusable.
10. Compare before/after renders and remove changes that add style without improving comprehension or finish.

## Expensive-Looking Without Excess

A premium result usually comes from restraint:

- fewer, better-defined surfaces;
- sharper typography hierarchy;
- consistent density;
- precise alignment;
- deliberate white space;
- predictable states;
- subtle elevation;
- coherent iconography;
- meaningful copy;
- no decorative effect without a job.

Do not equate premium with glassmorphism, gradient text, huge rounding, glow, random 3D, extra animation, or an imported font for every surface.

## Verification

Report the visible defects fixed, the tokens/components changed, the states/viewports inspected, and any craft debt left. Build success alone is not evidence.

## Related Skills

- `skill-impeccable`
- `skill-open-design-ui`
- `skill-modern-ui-patterns`
- `skill-frontend-ux-guardrails`
- `skill-motion-design-principles`
