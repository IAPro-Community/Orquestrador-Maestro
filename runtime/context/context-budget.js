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
      const lenA = typeof a.value === "string" ? a.value.length : 100;
      const lenB = typeof b.value === "string" ? b.value.length : 100;
      return lenA - lenB; // Ascending length
    });

    const result = [];
    let currentCost = 0;

    for (const item of sorted) {
      // Estimate cost
      const valueCost = typeof item.value === "string" ? Math.ceil(item.value.length / 4) : 25;
      const itemCost = 10 + valueCost; // base cost + value cost

      // USER_DECISION and critical blocking facts are ALWAYS preserved regardless of budget
      const isCritical = item.kind === "USER_DECISION" || item.key.startsWith("critical.") || item.key.startsWith("blocking.");

      if (isCritical) {
        result.push(item);
        currentCost += itemCost;
      } else {
        if (currentCost + itemCost <= maxTokens) {
          result.push(item);
          currentCost += itemCost;
        }
      }
    }

    return result;
  }
}

module.exports = { ContextBudget };
