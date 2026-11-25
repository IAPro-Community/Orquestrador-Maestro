# Quality profiles

Quality profiles state what "done" requires for a stack. They are opt-in and
default OFF (`harness.qualityProfiles`).

## Contract

- A green build is not proof of functional or UI acceptance. `build`, `lint`
  and `typecheck` never satisfy a functional or UI requirement.
- An unknown stack is blocking (`UNKNOWN_STACK`), never a permissive profile.
- A UI task on a stack without a UI verifier reports a limitation instead of
  pretending user-visible acceptance was certified.
- Verification and evidence are supplied by the caller; the profile only
  reports what is still missing.

## Usage

```js
const { getQualityProfile, evaluateQualityEvidence } = require("./runtime/profiles");
const { resolveFeatureFlags } = require("./runtime/config/feature-flags");

const features = resolveFeatureFlags(config.features);
const profile = getQualityProfile({
  stack: "node",
  ui: true,
  features,
  // Operator addition for a known stack; validated, never silently dropped.
  extraRequirements: [{ id: "visual-diff", kind: "ui", verifier: "npm run test:visual" }]
});
const result = evaluateQualityEvidence({ profile, verifications, evidence });
// result.complete === true only with functional + responsive + a11y + visual-diff evidence
```

Known stacks: `node`, `java`, `python`, `go`. Extending the registry requires a
real verifier command for the new stack and a test proving a build alone cannot
pass.