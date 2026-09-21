# Visual QA

Harness: `scripts/visual-qa.mjs`

Capabilities:

- start or attach to a URL
- capture screenshots per viewport
- collect console errors and page errors
- detect document overflow (`scrollWidth > clientWidth`)
- detect elements overflowing the viewport
- estimate contrast for sampled text vs background where computed styles are available
- report console/page errors and environment limitations
- write `report.json` + PNG files when a browser is available

## Quality score (informational)

| Dimension | Max |
|---|---|
| Accessibility | 20 |
| Contrast | 15 |
| Responsive | 15 |
| Consistency | 15 |
| Typography | 10 |
| Spacing | 10 |
| Visual hierarchy | 10 |
| Console/runtime | 5 |
| **Total** | **100** |

Hard failures listed in `SKILL.md` ignore a high score.

## PRESERVE mode

Pass `--baseline <dir>`. A screenshot mismatch fails the run. Use this for MIGRATE/REFACTOR.
