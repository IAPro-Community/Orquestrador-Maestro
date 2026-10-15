# Workflow: REDESIGN

Allowed only with explicit user intent (`modernize`, `redesenhe`, `nova identidade`) or Design Profile `creativity: high` **plus** a request that names redesign.

Default posture: `EXPLORE`. Creativity: `HIGH` unless the profile caps it lower. The lower cap wins.

Before any visual implementation, resolve the project design system. If discovery is ambiguous
or unresolved, stop with `BLOCKED_REQUIRES_USER_DECISION`.

## Do not start in code

```text
DISCOVERY
    ↓
CURRENT UI ANALYSIS
    ↓
PRODUCT CONTEXT
    ↓
DESIGN PROFILE
    ↓
DESIGN-SYSTEM CAPABILITIES
    ↓
VISUAL REFERENCES
    ↓
DESIGN DIRECTIONS (2 or 3, genuinely different)
    ↓
VISUAL REVIEW of directions
    ↓
IMPLEMENTATION of the chosen direction
    ↓
VISUAL QA
```

## Directions must differ in

- hierarchy
- composition
- density
- typography
- imagery
- motion
- responsiveness
- product personality

Cosmetic variants of the same layout do not count as three directions.

## Reject automatically

- cards for everything
- decorative gradients without a product reason
- arbitrary glassmorphism
- giant border-radius
- shadow excess
- generic hero
- four metric cards
- sidebar without an information-architecture need
- low-contrast gray body text

## Implementation gate

No component work until one direction is chosen and recorded under the project's configured design-notes directory or the task notes. Preserve business flow (login still logs in; recovery still recovers).
