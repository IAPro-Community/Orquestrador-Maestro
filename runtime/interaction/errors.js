"use strict";

function normalizeManagedError(error, fields = {}) {
  const source = error && typeof error === "object" ? error : {};
  return {
    kind: fields.kind || source.kind || "execution-error",
    summary: fields.summary || source.summary || source.message || String(error),
    evidence: Array.isArray(fields.evidence || source.evidence) ? (fields.evidence || source.evidence) : [],
    cause: fields.cause || source.cause || "A execução não produziu o resultado esperado.",
    correctiveAction: fields.correctiveAction || source.correctiveAction || "Inspecione a evidência e corrija a causa indicada.",
    retryable: fields.retryable ?? source.retryable ?? false
  };
}

function formatManagedError(error, interactionProfile = { id: "default" }) {
  const normalized = normalizeManagedError(error);
  if (interactionProfile.id !== "focus") return normalized.summary;
  return `${normalized.summary} → evidência: ${normalized.evidence.join(", ") || "nenhuma"} → causa: ${normalized.cause} → correção: ${normalized.correctiveAction} → próximo passo: ${normalized.retryable ? "tentar novamente após a correção" : "inspecionar o bloqueio"}`;
}

module.exports = { formatManagedError, normalizeManagedError };
