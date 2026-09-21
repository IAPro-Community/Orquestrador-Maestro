"use strict";

class ContextBudget {
  static serialize(value) {
    if (typeof value === "string") return value;
    try {
      const serialized = JSON.stringify(value);
      return serialized === undefined ? String(value ?? "") : serialized;
    } catch {
      return String(value ?? "");
    }
  }

  static estimateSerializedTokens(value) {
    const serialized = ContextBudget.serialize(value);
    return Math.ceil(Buffer.byteLength(serialized, "utf8") / 4);
  }

  static estimateItemTokens(item) {
    return ContextBudget.estimateSerializedTokens(item);
  }

  static estimateContextTokens(intent, items) {
    return ContextBudget.estimateSerializedTokens({ intent, items });
  }

  /**
   * Applies the budget constraint to the context items using the same
   * serialization shape later consumed by SemanticPlanner.
   */
  static applyBudget(items, maxTokens = 8000, { intent = "" } = {}) {
    if (!Array.isArray(items)) return [];
    if (!Number.isInteger(maxTokens) || maxTokens < 0) throw new TypeError("maxTokens must be a non-negative integer");

    const sorted = [...items].sort((a, b) => {
      if (a.kind === "USER_DECISION" && b.kind !== "USER_DECISION") return -1;
      if (b.kind === "USER_DECISION" && a.kind !== "USER_DECISION") return 1;

      const relA = a.relevance !== undefined ? a.relevance : 1;
      const relB = b.relevance !== undefined ? b.relevance : 1;
      if (relA !== relB) return relB - relA;

      const confA = a.confidence !== undefined ? a.confidence : 1;
      const confB = b.confidence !== undefined ? b.confidence : 1;
      if (confA !== confB) return confB - confA;

      return ContextBudget.estimateItemTokens(a) - ContextBudget.estimateItemTokens(b);
    });

    const result = [];

    for (const item of sorted) {
      const isCritical = item.kind === "USER_DECISION"
        || String(item.key || "").startsWith("critical.")
        || String(item.key || "").startsWith("blocking.");
      const candidate = [...result, item];
      const candidateCost = ContextBudget.estimateContextTokens(intent, candidate);

      if (isCritical || candidateCost <= maxTokens) {
        result.push(item);
      }
    }

    return result;
  }
}

module.exports = { ContextBudget };
