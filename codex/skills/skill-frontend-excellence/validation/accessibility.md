# Accessibility validation

Minimum: WCAG 2.2 AA.

Automate with the project's accessibility tooling when available:

- axe serious/critical → FAIL
- missing accessible name on `button`, `a`, `input`, `select`, `textarea` → FAIL
- contrast of body-sized text < 4.5:1 → FAIL
- no `:focus-visible` equivalent when a control is focused → FLAG, FAIL if the control is primary

Manual (reviewer):

- keyboard path of the user task
- dialog focus restore
- reduced motion
- errors tied to fields
