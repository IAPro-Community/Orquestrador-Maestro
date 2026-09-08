---
name: skill-browser-agent
description: Use for reliable web-browser agents, semantic page inspection, Playwright automation, accessibility-tree navigation, structured browser actions, post-action validation, replay, and visual fallbacks for canvas or highly visual interfaces.
category: automation
risk: medium
source: local-browser-agent-patterns
---

# Browser Agent

Use this skill when an agent must inspect or operate a web interface. Keep planning, decision-making, execution, and validation separate.

For web-experience work, it can open public references, inspect visual structure and behavior, validate the project page, test navigation and conversion flows, and collect only the public information necessary for the task. It remains a browser-agent skill: it reports observable evidence and does not make art-direction decisions or replace `skill-premium-web-experience`.

## Operating contract

Represent the page as a compact state before asking a model to act:

```json
{
  "page": { "url": "...", "title": "...", "loading": false, "modalOpen": false },
  "elements": [
    { "id": "e42", "role": "button", "name": "Comprar", "enabled": true, "visible": true }
  ]
}
```

Include only actionable or context-bearing elements. Prefer accessibility roles, accessible names, labels, placeholders, links, form relationships, enabled state, visibility, and stable test IDs. Include coordinates only as a fallback.

Do not inject sequential IDs into every DOM node as the primary strategy. IDs become stale after re-rendering and are unreliable across frames, modals, and virtualized lists. If temporary IDs are needed, bind them to a fresh snapshot, retain the locator metadata, and revalidate immediately before execution.

## Decision and execution

The model must return schema-validated actions, never raw browser code:

```json
{ "action": "CLICK", "elementId": "e42", "reason": "Adicionar o produto ao carrinho." }
```

Supported baseline actions: `NAVIGATE`, `CLICK`, `TYPE`, `SELECT`, `CHECK`, `SCROLL`, `PRESS`, `WAIT`, and `DONE`. Reject unknown actions, missing targets, cross-origin navigation outside the approved scope, and destructive actions without explicit authorization.

The executor should use semantic Playwright locators first, then stable test IDs, then a validated temporary locator. Never let the model execute JavaScript or construct arbitrary selectors directly.

## Validation loop

After every action:

1. Capture a fresh semantic state.
2. Wait for the relevant navigation, network, loading, or UI transition with a bounded timeout.
3. Check for errors, blocked controls, unexpected dialogs, and meaningful state change.
4. Record the action, target metadata, before/after state summary, result, and error if any.
5. Stop on success, ask for recovery when progress stalls, and cap retries to prevent loops.

## Visual fallback

Use screenshots only when semantic state cannot represent the needed information: canvas, WebGL, charts, maps, drag handles, or purely visual controls. Pair the screenshot with the semantic state and keep the fallback action bounded and auditable.

Handle iframes, Shadow DOM, authentication, CAPTCHAs, downloads, and file uploads explicitly. Never bypass a CAPTCHA or expose credentials in model context. Keep browser profiles, cookies, screenshots, and traces private and out of public repositories.

## Implementation checklist

- Define the approved origin and action policy before opening the browser.
- Build a compact snapshot from the accessibility tree and DOM semantics.
- Use structured output with a JSON Schema for decisions.
- Revalidate targets immediately before acting.
- Capture post-action state and detect progress.
- Add deterministic tests for stale elements, disabled controls, modals, frames, and retry limits.
- Keep screenshots and traces opt-in, redacted, and local.

## Premium Web Boundary

- Use it to inspect Godly Website, Awwwards, or another approved public reference when web access is available.
- Capture principles and observable behavior rather than copying layout, code, assets, text, or branding.
- Pair semantic state with screenshots for visual claims and report what was actually verified.

## Related Skills

- `skill-premium-web-experience` — decides when research or browser validation adds value.
- `skill-webapp-testing` — deterministic E2E or visual regression coverage when a flow changes.
