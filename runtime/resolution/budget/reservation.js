"use strict";

const crypto = require("node:crypto");

function finiteOrNull(value) {
  return Number.isFinite(value) && value >= 0 ? Number(value) : null;
}

function integerOrNull(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeUsage(value = {}) {
  return Object.freeze({
    providerTokens: finiteOrNull(value.providerTokens),
    maestroContextTokens: finiteOrNull(value.maestroContextTokens),
    calls: integerOrNull(value.calls),
    agentsObserved: integerOrNull(value.agentsObserved),
    retries: integerOrNull(value.retries),
    escalations: integerOrNull(value.escalations),
    durationMs: finiteOrNull(value.durationMs)
  });
}

function createBudgetReservation({ id, estimate = {}, createdAt } = {}) {
  return Object.freeze({
    schemaVersion: 1,
    id: id || `reservation-${crypto.randomUUID()}`,
    state: "reserved",
    estimate: normalizeUsage(estimate),
    actual: null,
    reason: null,
    createdAt: createdAt || new Date().toISOString(),
    completedAt: null
  });
}

function commitBudgetReservation(reservation, actual = {}, { completedAt } = {}) {
  if (!reservation || reservation.state !== "reserved") throw new TypeError("a reserved budget reservation is required");
  return Object.freeze({
    ...reservation,
    state: "committed",
    actual: normalizeUsage(actual),
    completedAt: completedAt || new Date().toISOString()
  });
}

function releaseBudgetReservation(reservation, reason, { completedAt } = {}) {
  if (!reservation || reservation.state !== "reserved") throw new TypeError("a reserved budget reservation is required");
  const normalizedReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 256) : "unused";
  return Object.freeze({
    ...reservation,
    state: "released",
    actual: null,
    reason: normalizedReason,
    completedAt: completedAt || new Date().toISOString()
  });
}

function withBudgetReservation(contract, reservation) {
  if (!contract || contract.engine !== "maestro-resolution-engine") throw new TypeError("canonical resolution contract is required");
  return Object.freeze({
    ...contract,
    budget: Object.freeze({
      ...contract.budget,
      reservation
    })
  });
}

module.exports = {
  normalizeUsage,
  createBudgetReservation,
  commitBudgetReservation,
  releaseBudgetReservation,
  withBudgetReservation
};
