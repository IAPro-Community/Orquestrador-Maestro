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

  static isPriorityItem(item) {
    return item?.kind === "USER_DECISION"
      || String(item?.key || "").startsWith("critical.")
      || String(item?.key || "").startsWith("blocking.");
  }

  static applyBudget(items, maxTokens = 8000, { intent = "", ensureOne = true } = {}) {
    if (!Array.isArray(items)) return [];
    if (!Number.isInteger(maxTokens) || maxTokens < 0) {
      throw new TypeError("maxTokens must be a non-negative integer");
    }

    const sorted = [...items].sort((a, b) => {
      const priorityA = ContextBudget.isPriorityItem(a) ? (a.kind === "USER_DECISION" ? 2 : 1) : 0;
      const priorityB = ContextBudget.isPriorityItem(b) ? (b.kind === "USER_DECISION" ? 2 : 1) : 0;
      if (priorityA !== priorityB) return priorityB - priorityA;

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
      const candidate = [...result, item];
      const candidateCost = ContextBudget.estimateContextTokens(intent, candidate);
      if (candidateCost <= maxTokens || (ensureOne && result.length === 0)) result.push(item);
    }

    const actualCost = ContextBudget.estimateContextTokens(intent, result);
    Object.defineProperty(result, "overBudget", {
      value: actualCost > maxTokens,
      enumerable: false,
      writable: false
    });
    return result;
  }
}

module.exports = { ContextBudget };
