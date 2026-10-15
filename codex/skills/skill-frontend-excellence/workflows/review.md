# Workflow: REVIEW

The reviewer may be the same agent, but the role is separate: no more implementation until findings are listed.

Resolve the project design system before reviewing visual changes; ambiguous or unresolved
discovery requires an explicit user decision.

## Inputs

- screenshots per viewport
- Design Profile
- Active design-system metadata (tokens + components)
- stated intent / posture / creativity
- DOM or accessibility tree when useful

## Score dimensions (100)

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

A hard failure (contrast, keyboard trap, overflow, PRESERVE regression, console error) makes the review `FAIL` regardless of score.

## Output

A list of findings in the YAML shape from `SKILL.md`. Sort by severity: `critical`, `high`, `medium`, `low`. Include at least one concrete action per finding.
