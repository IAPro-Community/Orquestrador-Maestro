"use strict";

class ContextBudget {
  /**
   * Applies the budget constraint to the context items.
   * Prioritizes USER_DECISION, high relevance, and high confidence.
   * Does NOT just discard large files.
   *
   * @param {Array} items - List of ContextItems.
   * @param {number} maxTokens - The maximum allowed tokens (estimated).
   * @returns {Array} The budgeted ContextItems.
   */
  static estimateCost(value) {
    if (typeof value === "string") return Math.ceil(value.length / 4);
    // Objects (e.g. a whole contextBrief) must be measured, not flat-rated:
    // serialize and estimate like any other payload.
    try {
      const text = JSON.stringify(value) ?? "";
      return Math.ceil(text.length / 4);
    } catch {
      return 25;
    }
  }

  static applyBudget(items, maxTokens = 8000) {
    if (!Array.isArray(items)) return [];

    // Sort items by priority:
    // 1. USER_DECISION always wins
    // 2. High relevance
    // 3. High confidence
    // 4. Smaller token cost (simulated by string length for now)

    const sorted = [...items].sort((a, b) => {
      if (a.kind === "USER_DECISION" && b.kind !== "USER_DECISION") return -1;
      if (b.kind === "USER_DECISION" && a.kind !== "USER_DECISION") return 1;

      const relA = a.relevance !== undefined ? a.relevance : 1;
      const relB = b.relevance !== undefined ? b.relevance : 1;
      if (relA !== relB) return relB - relA; // Descending relevance

      const confA = a.confidence !== undefined ? a.confidence : 1;
      const confB = b.confidence !== undefined ? b.confidence : 1;
      if (confA !== confB) return confB - confA; // Descending confidence

      // Secondary: string length cost
      const lenA = ContextBudget.estimateCost(a.value) * 4;
      const lenB = ContextBudget.estimateCost(b.value) * 4;
      return lenA - lenB; // Ascending length
    });

    const result = [];
    let currentCost = 0;

    for (const item of sorted) {
      // Estimate cost
      const itemCost = 10 + ContextBudget.estimateCost(item.value); // base cost + value cost

      // Critical facts keep priority order (sorted first) but still count
      // against the budget: the loop stops once the cap is exceeded, except
      // it always keeps the single highest-priority item so context is
      // never silently empty.
      if (currentCost + itemCost <= maxTokens || result.length === 0) {
        result.push(item);
        currentCost += itemCost;
      }
    }

    return result;
  }
}

module.exports = { ContextBudget };
