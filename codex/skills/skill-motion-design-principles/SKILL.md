---
name: skill-motion-design-principles
description: Design and review UI motion systems for purpose, timing, easing, choreography, interruption, feedback, reduced motion, performance, and responsive behavior without decorative animation.
category: frontend
risk: low
source: orquestrador-native
---

# Motion Design Principles

Use when animation or transition quality is itself part of the task. This skill decides whether motion should exist, what it communicates, and how it should behave.

## Motion Has A Job

Every motion must do at least one of these:

- explain spatial relationship;
- preserve continuity;
- communicate state change;
- direct attention;
- confirm input;
- reveal hierarchy progressively;
- make causality understandable.

If it does none of them, remove it.

## Review Model

For every animation define:

- trigger;
- user/system cause;
- element ownership;
- start and end states;
- duration;
- easing;
- delay/stagger;
- interruption/cancellation behavior;
- repeated-trigger behavior;
- reduced-motion fallback;
- performance risk.

## Motion Posture

Choose the motion posture from product context before tuning individual animations:

- **Restraint-first:** productivity tools, admin surfaces, repeated controls and high-frequency actions. Prefer instant state change or very short transitions; animation must earn its cost.
- **Production polish:** default for consumer/product UI. Preserve continuity and hierarchy with subtle, consistent motion that does not call attention to itself.
- **Expressive:** low-frequency brand moments, onboarding, marketing or playful experiences where motion is part of the product character. Keep interaction clarity and interruption behavior intact.

Frequency is a gate: the more often an interaction is triggered, the stronger the case for shorter or no animation. Do not apply expressive motion rules to repetitive operational UI.

## Timing

- Immediate feedback should feel immediate.
- Small local transitions should normally be shorter than navigation or large spatial transitions.
- Staggers must clarify order, not make users wait.
- Avoid chaining decorative entrances across an entire dashboard.
- Keep duration consistent by semantic role rather than assigning arbitrary values component by component.

## Easing

Use easing to represent physical/interaction intent:

- entering: decelerate into place;
- exiting: leave decisively;
- reversible interaction: use symmetric behavior where appropriate;
- spring behavior only when elasticity communicates the interaction.

Avoid exaggerated bounce, long overshoot, and unrelated easing families in the same system.

## Choreography

- animate hierarchy, not every DOM node;
- prefer parent/child choreography over independent random delays;
- preserve the user’s point of reference during route, drawer, modal, list, and detail transitions;
- avoid simultaneous competing focal points;
- scrolling effects must not impair reading, navigation, or input.

## Implementation Constraints

Prefer compositor-friendly transform and opacity. Treat layout animation, blur, filters, large shadows, continuous canvas/WebGL, and scroll handlers as explicit performance decisions. Measure when motion is persistent or complex.

Do not introduce an animation library when CSS/Web Animations or the project’s existing motion primitive is sufficient.

## Accessibility

Support `prefers-reduced-motion`. Reduced motion must preserve state communication rather than simply deleting all feedback. Avoid parallax/zoom/intense movement that can create discomfort. Never make content comprehension depend on animation.

## Responsive Motion

Mobile may need shorter travel, simpler choreography, fewer simultaneously animated layers, and removal of hover-only behavior. Touch feedback should not depend on pointer hover.

## Verification

Inspect the real rendered interaction at normal and reduced motion. Test repeated triggers, rapid interaction, cancellation, route changes, slow devices when relevant, and state correctness after animation finishes.

## Related Skills

- `skill-design-engineering-craft`
- `skill-open-design-ui`
- `skill-premium-web-experience`
- `skill-frontend-ux-guardrails`
