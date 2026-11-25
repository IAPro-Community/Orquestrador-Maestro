"use strict";

/**
 * Per-stack quality profiles.
 *
 * A profile states which evidence is required for "done" on a stack. It never
 * runs commands and never infers a result: the caller supplies verification
 * and evidence records, and the profile reports what is missing.
 *
 * Load-bearing rule: a green build is not proof of UI acceptance. When a task
 * has user-visible surface, functional verification alone only satisfies the
 * functional requirement; accessibility/responsive requirements stay missing
 * until their own evidence exists.
 *
 * An unknown stack is not a permissive profile: it returns a blocking
 * `UNKNOWN_STACK` requirement so no gate silently passes.
 */

const PROFILES = Object.freeze({
  node: Object.freeze({
    id: "node",
    stack: "node",
    functional: Object.freeze([
      Object.freeze({ id: "unit-tests", command: "npm test", requiredWhen: "always" })
    ]),
    ui: Object.freeze([
      Object.freeze({ id: "responsive", command: "npm run test:ui:responsive", requiredWhen: "ui" }),
      Object.freeze({ id: "a11y", command: "npm run test:ui:a11y", requiredWhen: "ui" })
    ])
  }),
  java: Object.freeze({
    id: "java",
    stack: "java",
    functional: Object.freeze([
      Object.freeze({ id: "unit-tests", command: "mvn -q test", requiredWhen: "always" })
    ]),
    ui: Object.freeze([])
  }),
  python: Object.freeze({
    id: "python",
    stack: "python",
    functional: Object.freeze([
      Object.freeze({ id: "unit-tests", command: "python -m pytest -q", requiredWhen: "always" })
    ]),
    ui: Object.freeze([])
  }),
  go: Object.freeze({
    id: "go",
    stack: "go",
    functional: Object.freeze([
      Object.freeze({ id: "unit-tests", command: "go test ./...", requiredWhen: "always" })
    ]),
    ui: Object.freeze([])
  })
});

const KNOWN_STACKS = Object.freeze(Object.keys(PROFILES));

function normalizeStack(value) {
  if (typeof value !== "string") return null;
  const stack = value.trim().toLowerCase();
  return KNOWN_STACKS.includes(stack) ? stack : null;
}

/**
 * Operator-supplied requirements extend a known stack profile. They are
 * validated strictly: an unreadable or verifier-less entry is rejected rather
 * than silently dropped, because a dropped requirement would look satisfied.
 */
function normalizeExtraRequirements(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError("extraRequirements must be an array");
  const normalized = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError("each extra requirement must be an object");
    }
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const verifier = typeof item.verifier === "string" ? item.verifier.trim() : "";
    const kind = item.kind === undefined ? "functional" : item.kind;
    if (!/^[a-z][a-z0-9.-]{1,63}$/u.test(id)) throw new TypeError("extra requirement id is invalid: " + id);
    if (!verifier) throw new TypeError("extra requirement " + id + " requires a verifier command");
    if (kind !== "functional" && kind !== "ui") throw new TypeError("extra requirement " + id + " has an invalid kind");
    if (seen.has(id)) throw new TypeError("duplicate extra requirement: " + id);
    seen.add(id);
    normalized.push(Object.freeze({ id, kind, verifier, reason: null }));
  }
  return normalized;
}

/**
 * Selects the profile for a stack. `ui` decides whether the UI requirements
 * apply; it never removes the functional requirement.
 */
function selectQualityProfile({ stack, ui = false, extraRequirements } = {}) {
  const extra = normalizeExtraRequirements(extraRequirements);
  const normalized = normalizeStack(stack);
  if (!normalized) {
    return Object.freeze({
      id: "unknown",
      stack: typeof stack === "string" && stack.trim() !== "" ? stack.trim().slice(0, 40) : "unknown",
      known: false,
      requirements: Object.freeze([Object.freeze({
        id: "stack-detection",
        kind: "blocking",
        verifier: null,
        reason: "UNKNOWN_STACK"
      })]),
      limitations: Object.freeze(["An unknown stack cannot be certified; provide a verifier before claiming done."])
    });
  }
  const profile = PROFILES[normalized];
  const baseRequirements = [
    ...profile.functional.map((entry) => ({
      id: entry.id, kind: "functional", verifier: entry.command, reason: null
    })),
    ...profile.ui.filter(() => ui === true).map((entry) => ({
      id: entry.id, kind: "ui", verifier: entry.command, reason: null
    }))
  ];
  const knownIds = new Set(baseRequirements.map((entry) => entry.id));
  const collision = extra.find((entry) => knownIds.has(entry.id));
  if (collision) throw new TypeError("extra requirement conflicts with an existing requirement: " + collision.id);
  const requirements = [
    ...baseRequirements,
    ...extra
  ];
  return Object.freeze({
    id: profile.id,
    stack: profile.stack,
    known: true,
    ui: ui === true,
    requirements: Object.freeze(requirements.map((entry) => Object.freeze(entry))),
    limitations: Object.freeze(
      ui === true && profile.ui.length === 0
        ? ["This stack declares no UI verifier; user-visible acceptance cannot be certified by this profile."]
        : []
    )
  });
}

function indexById(items, key = "id") {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (item && typeof item === "object" && typeof item[key] === "string") map.set(item[key], item);
  }
  return map;
}

/**
 * Compares required evidence against supplied verification and evidence.
 * `buildOnly` is reported when only a build/syntax check exists: it never
 * satisfies a functional or UI requirement.
 */
function evaluateQualityEvidence({ profile, verifications = [], evidence = [] } = {}) {
  if (!profile || !Array.isArray(profile.requirements)) {
    throw new TypeError("a selected quality profile is required");
  }
  const passedVerifications = new Set(
    (Array.isArray(verifications) ? verifications : [])
      .filter((item) => item && item.status === "passed")
      .map((item) => (typeof item.id === "string" ? item.id : null))
      .filter(Boolean)
  );
  const passedEvidence = indexById(
    (Array.isArray(evidence) ? evidence : []).filter((item) => item && item.status !== "failed"),
    "requirementId"
  );
  const sawBuildOnly = (Array.isArray(verifications) ? verifications : [])
    .some((item) => item && item.status === "passed" && /build|lint|typecheck/iu.test(String(item.id || item.kind || "")));

  const missing = [];
  const satisfied = [];
  for (const requirement of profile.requirements) {
    if (requirement.kind === "blocking") {
      missing.push(Object.freeze({ id: requirement.id, kind: requirement.kind, reason: requirement.reason }));
      continue;
    }
    const hasVerification = passedVerifications.has(requirement.id) || passedVerifications.has(requirement.verifier);
    const hasEvidence = passedEvidence.has(requirement.id);
    if (hasVerification || hasEvidence) {
      satisfied.push(Object.freeze({ id: requirement.id, kind: requirement.kind }));
    } else {
      missing.push(Object.freeze({
        id: requirement.id,
        kind: requirement.kind,
        reason: requirement.kind === "ui" ? "UI_EVIDENCE_REQUIRED" : "FUNCTIONAL_EVIDENCE_REQUIRED"
      }));
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    profileId: profile.id,
    stack: profile.stack,
    satisfied: Object.freeze(satisfied),
    missing: Object.freeze(missing),
    buildOnly: sawBuildOnly && satisfied.length === 0,
    limitations: profile.limitations || Object.freeze([]),
    complete: missing.length === 0
  });
}

module.exports = { PROFILES, KNOWN_STACKS, selectQualityProfile, evaluateQualityEvidence };