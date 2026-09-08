---
name: skill-open-design-ui
description: Use for defining and implementing a distinctive frontend visual system with design direction, tokens, component patterns, responsive UI, anti-generic decisions, and visual QA after the experience strategy is clear.
category: frontend
risk: low
source: https://github.com/nexu-io/open-design
---

# Skill Open Design UI

Use this skill for the visual-system and interface-design layer of a frontend task. It works with the project’s existing framework and styling system. For a full premium marketing experience, use `skill-premium-web-experience` first; this skill turns the approved direction into a coherent visual and component system.

## Scope

Own:

- design direction and visual language;
- typography, color, shape, depth, composition, spacing, grid, hierarchy, lighting, and texture;
- design tokens, component rules, responsive UI, and visual QA;
- anti-generic refinement without breaking product behavior.

Do not own the complete business discovery, narrative architecture, conversion strategy, or scroll-story decision. Refer those to `skill-premium-web-experience`. Use a specialized scroll implementation skill only when it is available and the narrative requires it.

## Workflow

1. Inspect the real surface, existing brand cues, `PRODUCT.md`, `DESIGN.md`, tokens, components, routes, icons, imagery, breakpoints, and states before editing.
2. Name one visual direction such as Modern Minimal, Tech Utility, Editorial, Bold Product, or Calm Enterprise. Explain why it fits the audience and surface.
3. Convert the direction into tokens for type scale, font roles, surfaces, borders, accents, elevation, spacing, radius, density, container width, and motion.
4. Apply the system to the smallest complete slice that includes the real content and states touched by the task.
5. Preserve routes, form semantics, analytics, permissions, localization, and existing interaction contracts.
6. Validate at mobile, tablet, and desktop sizes, then run the available lint, typecheck, build, targeted tests, and browser/screenshot checks.

## Visual Rules

- Use existing tokens first; introduce local variables only when a real gap exists.
- Keep repeated components consistent in radius, border, shadow, spacing, density, and icon treatment.
- Use cards for grouped data, repeated items, or framed tools; do not put every section in a floating panel or nest cards by default.
- Prefer real product screenshots, product states, or faithful UI previews over generic illustrations.
- Use a distinctive hierarchy and composition; do not add decoration that lacks a product or narrative reason.
- Avoid default purple/cyan palettes, decorative gradient text, gratuitous glassmorphism/glows, side-tab borders, extreme radii, flat typography, giant icon tiles, and motion without meaning.
- Keep copy specific, correctly spelled, localized, and UTF-8 safe.

## Responsive UI

Treat mobile as a designed composition. Define how navigation, type scale, spacing, media, grids, sticky regions, and touch interactions change at `320x568`, `390x844`, `768x1024`, `1024x768`, and a representative desktop width. Verify long labels, localized content, overflow, focus states, disabled states, and realistic data.

## Visual QA

Inspect the rendered page, not only the source or build output. Check hierarchy, line breaks, clipping, overlap, contrast, blank media, layout shift, animation glitches, and the first viewport’s clarity. Confirm that the primary action and status are understandable quickly. Compare before/after when refining an existing surface and report residual visual risk.

## Impeccable Vocabulary

When useful, classify the smallest intervention as `shape`, `craft`, `critique`, `polish`, `typeset`, `layout`, `colorize`, `animate`, `clarify`, `adapt`, `distill`, `quieter`, or `bolder`. Treat generated suggestions as options to evaluate, not authority. If the request is “genérico”, “parece feito por IA”, “mais profissional”, or “mais premium”, use this vocabulary to choose a bounded visual intervention instead of redesigning unrelated surfaces.

## Optional CLI

If the project already provides the Impeccable CLI, `npx impeccable detect <target>` is an additional deterministic signal. Do not install dependencies or enable live hooks automatically, and do not treat the command as a replacement for visual, accessibility, or browser QA.

## Done Criteria

- The visual direction is explicit and visible in the implemented surface.
- Tokens and repeated components are coherent.
- The first viewport communicates the real product, offer, or working surface.
- Responsive behavior and interaction states remain usable.
- Accessibility, content quality, existing contracts, and visual integrity were checked.

## Related Skills

- `skill-premium-web-experience` — complete experience strategy and narrative orchestration.
- `skill-modern-ui-patterns` — component composition and product interaction states.
- `skill-frontend-ux-guardrails` — final usability, accessibility, responsive, and layout gate.
- `skill-impeccable` — focused critique and polish requests.
