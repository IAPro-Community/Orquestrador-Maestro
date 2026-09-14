# Workflow: FIX

Default posture: `PRESERVE`. Default creativity: `LOW` (enough for a11y/responsive correction, not a restyle).

## Sequence

0. Resolve the project design system. Stop with `BLOCKED_REQUIRES_USER_DECISION` unless discovery is resolved.
1. Reproduce with evidence (screenshot, viewport, console, DOM).
2. Isolate the smallest failing surface.
3. Prefer token or layout fix over new markup.
4. Do not “clean up” neighboring styles.
5. Re-verify the failing viewport and at least one adjacent viewport.
6. Confirm the original bug is gone and no new overflow/console errors appeared.
