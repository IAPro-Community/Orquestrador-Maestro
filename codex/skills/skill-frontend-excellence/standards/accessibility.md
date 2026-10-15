# Accessibility (WCAG AA minimum)

Hard rules:

- Normal text contrast ≥ 4.5:1
- Large text contrast ≥ 3:1
- Visible focus (`:focus-visible`); do not remove outlines without a replacement
- Keyboard: all actions reachable, no trap, dialogs restore focus
- Semantic HTML first; ARIA only when native semantics are insufficient
- Accessible name on every control (label, `aria-label`, or labelled-by)
- Form errors associated to fields (`aria-describedby` or the project's error-summary component)
- Modals use the project's documented modal primitive (with focus management) unless the app has an equivalent
- Honor `prefers-reduced-motion`
- Color is not the only status signal

If the active design system documents a brand exception, record it explicitly. Do not copy exceptions into new product chrome. Prefer semantic text tokens.

Automate with the Visual QA harness and `skill-frontend-ux-guardrails`.
