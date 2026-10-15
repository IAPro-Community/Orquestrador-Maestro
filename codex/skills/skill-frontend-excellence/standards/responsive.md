# Responsive

When the active design system exposes breakpoint tokens, resolve them from its public metadata or project configuration. Do not assume a source-tree location. A useful neutral reference is:

| Reference | rem | px |
|---|---|---|
| small | 36rem | 576 |
| medium | 48rem | 768 |
| large | 62rem | 992 |
| extra-large | 75rem | 1200 |
| wide | 100rem | 1600 |

Required Visual QA widths: **390**, **768**, **1280**, **1440**.

Rules:

- Mobile is a designed composition, not a squeezed desktop.
- No page-level horizontal scroll for core tasks. Tables may scroll internally if headers/actions remain usable.
- Touch targets ≥ 44px on 390 unless the control is an inline text action with a larger hit area.
- Auth/admin split layouts must collapse (SSO already hides the aside ≤760px — do not invert that in PRESERVE).
- Test long labels, CPF, emails, and error strings.
