"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createResolution,
  createBudgetReservation,
  commitBudgetReservation,
  releaseBudgetReservation,
  withBudgetReservation
} = require("..");

function contract() {
  return createResolution({
    task: { id: "task-1", objective: "verify budget", acceptanceCriteria: [] },
    cognitiveBudget: { id: "STANDARD", tier: "standard", contextTokens: 8000 }
  });
}

test("budget reservation preserves unknown values instead of coercing them to zero", () => {
  const reservation = createBudgetReservation({
    estimate: { providerTokens: null, maestroContextTokens: 400, calls: 1 }
  });
  assert.equal(reservation.state, "reserved");
  assert.equal(reservation.estimate.providerTokens, null);
  assert.equal(reservation.estimate.maestroContextTokens, 400);
  assert.equal(reservation.estimate.calls, 1);
});

test("budget reservation commits measured usage exactly once", () => {
  const reservation = createBudgetReservation({ estimate: { calls: 1 } });
  const committed = commitBudgetReservation(reservation, {
    providerTokens: 1200,
    maestroContextTokens: 300,
    calls: 2,
    retries: 1,
    escalations: 0,
    durationMs: 25
  }, { completedAt: "2026-09-21T00:00:00.000Z" });
  assert.equal(committed.state, "committed");
  assert.equal(committed.actual.providerTokens, 1200);
  assert.equal(committed.actual.calls, 2);
  assert.throws(() => commitBudgetReservation(committed, {}), /reserved budget reservation/u);
});

test("unused reservation releases without manufacturing actual usage", () => {
  const reservation = createBudgetReservation({ estimate: { providerTokens: 1000 } });
  const released = releaseBudgetReservation(reservation, "preflight-block");
  assert.equal(released.state, "released");
  assert.equal(released.reason, "preflight-block");
  assert.equal(released.actual, null);

  const updated = withBudgetReservation(contract(), released);
  assert.equal(updated.budget.reservation.state, "released");
});
