---
name: skill-premium-web-experience
description: Use for creating, redesigning, or transforming websites into premium, cinematic, conversion-focused web experiences with visual research, storytelling, scroll-driven interaction, responsive design, motion, performance, accessibility, and visual QA.
category: frontend
risk: low
source: local-frontend-patterns
---

# Skill Premium Web Experience

Use this as the experience-orchestration layer for a public website, landing page, brand surface, or marketing experience whose success depends on more than visual polish. It is framework-agnostic: adapt the work to React, Next.js, Vite, Vue, Svelte, Astro, HTML/CSS/JS, or another frontend stack already present in the project.

The goal is to turn “quero um site bonito” into a coherent experience with a business objective, audience, narrative, art direction, interaction model, conversion path, technical implementation, and verified rendering. Do not start by creating components.

## Operating Principles

1. Understand the business, audience, product, offer, objective, and conversion path.
2. Inspect the project and references before choosing a concept.
3. Define the experience concept, narrative, visual direction, interaction, and constraints before implementation.
4. Coordinate focused skills instead of copying their full content into this workflow.
5. Treat premium as clarity plus intentional detail, not as visual excess.
6. Validate the rendered result on desktop and mobile; a successful build is not visual QA.

## Reference Websites

Use these websites as inspiration and research sources:

- Godly Website: https://godly.website/
- Awwwards: https://www.awwwards.com/

When web access is available, research both hubs, find references related to the product category, identify recurring patterns, extract principles, and adapt them to the project. Ask “what makes this reference feel premium?” rather than “how do I copy this?”. Do not clone their visuals, code, assets, text, or layout.

## Phase 0 — Project Inspection

- Locate the project entrypoints, framework, routes, build/lint/typecheck commands, assets, fonts, analytics boundaries, design tokens, component primitives, and existing responsive rules.
- Read `AGENTS.md`, relevant `DEV/` context, `PRODUCT.md`, and `DESIGN.md` when they exist.
- Identify the real page or route to change and preserve existing behavior, permissions, analytics, SEO, and content contracts.
- Record constraints, unknowns, and facts that must not be invented.

## Phase 1 — Business Discovery

Create a short brief covering:

- company, product, audience, offer, positioning, value proposition, differentiators, objections, proof, trust signals, primary CTA, secondary CTA, conversion path, and business model;
- what the visitor should understand, feel, and do in the first viewport and after each major chapter.

If a URL is provided, inspect it. If screenshots or documentation are provided, analyze them. Never invent customers, metrics, testimonials, certifications, partnerships, awards, features, financial data, or security claims. Mark missing proof as a content gap.

## Phase 2 — Reference Research

Research Godly Website and Awwwards first when browsing is available. Select a small set of relevant references and annotate:

- visual hierarchy, interaction, storytelling, motion, typography, composition, transitions, and responsive behavior;
- the transferable principle, the reason it fits this product, and the adaptation needed for the actual audience and conversion goal.

Use `skill-browser-agent` for reliable page inspection, public reference collection, and browser validation when its capabilities are available.

## Phase 3 — Experience Concept

Define one concept in a sentence, the emotional lane, the primary user promise, and the visual or interaction metaphor. Reject concepts that cannot explain how they improve comprehension or conversion. Choose a restrained concept over a pile of effects.

## Phase 4 — Narrative Architecture

Design the sequence around the visitor’s questions, not a mandatory template. A useful adaptable model is:

`Attention → Context → Problem → Tension → Discovery → Solution → Demonstration → Proof → Trust → Conversion`

Select only the chapters the product needs. For every section, write “this section exists to ___”. Remove sections without a clear answer. Do not force `Hero → Features → About → Testimonials → Pricing → FAQ → CTA` when another narrative is more truthful or effective.

## Phase 5 — Visual Direction

Before implementation, specify typography, color, shape, depth, composition, spacing, grid, hierarchy, lighting, texture, and motion language. State the anti-references and the rules that make the system distinctive.

Avoid without a product reason:

- purple gradients, random blobs, excessive glassmorphism, random 3D objects, meaningless glowing borders, excessive pills, identical cards, fake dashboards, generic stock images, fake statistics, and generic icon grids;
- decorative choices that compete with reading, obscure the offer, or imitate a reference.

Use `skill-open-design-ui` for design direction, tokens, visual system, component system, responsive UI, anti-generic decisions, and visual QA. It defines the system; this skill defines why the system exists in the experience.

## Phase 6 — Design Tokens

Translate the visual direction into a small token set for type scale, font roles, colors, surfaces, borders, shadows, spacing, radii, container widths, breakpoints, z-index layers, and motion timing/easing. Reuse existing tokens where possible. Keep tokens framework-neutral and map them to the project’s styling mechanism during implementation.

## Phase 7 — Hero

The hero must answer quickly: what is it, who is it for, why does it matter, and what is the next step? Select the simplest treatment that makes the promise concrete: cinematic type, product visualization, video, interactive object, data visualization, layered composition, controlled 3D, or progressive reveal. Never sacrifice clarity for spectacle.

## Phase 8 — Scroll Storytelling

Treat scroll as a narrative system that may control position, scale, opacity, typography, background, depth, product state, progressive disclosure, and chapter transitions. Compose layers deliberately: background, atmosphere, primary subject, supporting elements, typography, and UI/data.

Use parallax only when it communicates sequence, scale, cause and effect, or product depth. Do not add it because it looks attractive. If a specialized `scroll-experience` skill is available in the installation, use it to decide how to implement sticky scenes, pinning, progress-driven animation, and fallbacks. If it is unavailable, implement only progressive-enhancement patterns that remain understandable without the effect and record the missing capability.

## Phase 9 — Motion System

Define entrance, exit, hover, scroll, transition, feedback, and loading behavior. Prefer transform and opacity. Use scale, blur, clip-path, or controlled parallax only where they support hierarchy or state. Avoid random floating, constant movement, unnecessary spinning, excessive bounce, and motion that competes with reading. Every animation needs a trigger, purpose, duration, interruption rule, and reduced-motion behavior.

## Phase 10 — Cinematic Interaction Patterns

Select only the patterns justified by the narrative:

- Sticky Story
- Product Reveal
- Transformation
- Before/After
- Data Journey
- Layered Depth
- Chapter Transition
- Scroll-linked Product Demonstration

Prefer a small number of legible scenes over a continuous effects reel. Keep controls, keyboard access, and a static or simplified fallback available.

## Phase 11 — Conversion Architecture

Map intent by stage:

- Early: discover, explore, learn.
- Middle: compare, simulate, see how it works.
- Late: start, buy, request a demo, or contact.

Place a clear primary action where confidence is earned and a secondary path for lower-intent visitors. Vary CTA placement by narrative purpose; do not repeat the same CTA mechanically. Preserve real routes, form behavior, validation, tracking, and error states.

## Phase 12 — Trust Architecture

Add customer proof, metrics, security information, certifications, integrations, partners, testimonials, case studies, guarantees, or company history only when relevant and real. Match each claim to its source and context. Never invent proof for a production-facing experience.

## Phase 13 — Responsive Behavior

Design desktop, laptop, tablet, and mobile behavior deliberately; mobile is not a smaller desktop. Define changes to composition, type, spacing, media, navigation, sticky regions, and interaction density. For every complex animation ask: “does this still improve the mobile experience?”. If not, simplify, replace, or disable it. Test long content and narrow widths.

## Phase 14 — Accessibility

Require semantic HTML, keyboard navigation, visible focus states, accessible labels, sufficient contrast, readable text, usable touch targets, and reduced motion. Content must remain understandable without animation, hover, color alone, or a pointer. Include an explicit `@media (prefers-reduced-motion: reduce)` strategy and test it.

## Phase 15 — Performance

Premium does not mean heavy. Optimize images, video, fonts, JavaScript, animation, rendering, lazy loading, and code splitting. Avoid layout thrashing, huge unoptimized video, excessive DOM, continuous expensive animations, and unnecessary dependencies. Defer non-critical media and keep the first viewport fast and meaningful.

## Phase 16 — Implementation

Implement in the project’s existing stack after the brief, narrative, visual direction, tokens, and interaction decisions are written down. Build the smallest coherent vertical slice first: hero, one representative chapter, conversion path, and responsive fallback. Then expand only when the narrative requires it.

Use the specialized skills by responsibility:

| Need | Delegate to |
|---|---|
| Experience strategy, narrative, coordination | `skill-premium-web-experience` |
| Design direction, tokens, components, responsive UI, visual QA | `skill-open-design-ui` |
| Components, states, forms, tables, cards, navigation, dashboards, SaaS UI | `skill-modern-ui-patterns` |
| Final responsive, accessibility, overflow, usability, and layout gate | `skill-frontend-ux-guardrails` |
| Refinement when a surface feels generic, amateur, or unfinished | `skill-impeccable` |
| Scroll implementation, when installed | `scroll-experience` |
| Public reference inspection and browser validation | `skill-browser-agent` |
| Independent research/design/engineering/QA lanes only when justified | `skill-multiagent-orchestration` |
| A marketing surface that is part of a larger SaaS | `skill-saas-factory` |

Do not copy the complete content of these skills here. This skill decides when they add value; each specialist decides how to execute its own discipline.

## Phase 17 — Visual QA

Do not finish because the project compiled. Inspect the rendered page at desktop and mobile sizes, including at least `320x568`, `390x844`, `768x1024`, `1024x768`, and a representative desktop width.

Check desktop: hero clarity, navigation, typography, spacing, animation timing, chapter transitions, sections, proof, and CTA. Check mobile: overflow, line breaks, navigation, sticky behavior, spacing, touch targets, and motion fallback. Check functionality: links, buttons, forms, validation, loading, error, success, focus, disabled, and navigation states. Check visual integrity: clipping, overlap, overflow, contrast, layout shift, blank media, and animation glitches. Correct P0/P1 issues before delivery and report residual risk.

## Multiagent Boundary

Use multiple agents only for genuinely independent work such as reference research, UX strategy, art direction, motion implementation, frontend implementation, or QA. Assign ownership before editing, keep agents from modifying the same component tree simultaneously, and centralize integration and final verification with the lead. For a simple page or focused polish pass, stay with one agent.

## Completion Checklist

- Business brief and factual content boundaries are recorded.
- Reference principles were adapted rather than copied.
- Narrative and section purpose are explicit.
- Visual direction, tokens, interaction, conversion, trust, responsive behavior, accessibility, and performance decisions are implemented.
- Specialist skills were invoked only where their responsibility was needed.
- Rendered desktop/mobile views and meaningful states were inspected.
- Build, lint, typecheck, targeted tests, and browser/screenshot checks were run when available.
- Spelling, accents, UTF-8, links, claims, and remaining risks were reviewed.

## Related Skills

- `skill-open-design-ui`
- `skill-modern-ui-patterns`
- `skill-frontend-ux-guardrails`
- `skill-impeccable`
- `skill-browser-agent`
- `skill-multiagent-orchestration`
- `skill-saas-factory`
