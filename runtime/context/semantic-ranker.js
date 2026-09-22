"use strict";

class SemanticRanker {
  /**
   * Encapsulates the local AI provider to enrich the deterministic context.
   * If the user policy restricts remote calls (localOnly = true), this MUST NOT fallback to cloud.
   *
   * @param {Object} application - The Maestro application instance.
   * @param {Object} options - Configuration options.
   * @param {boolean} options.localOnly - If true, strictly prevent cloud fallback.
   */
  constructor(application, options = {}) {
    this.app = application;
    this.localOnly = Boolean(options.localOnly);
    // Provider resolved from options (default "local"). There is no
    // locality registry for providers, so under localOnly only the
    // explicit local provider id is permitted (fail closed, loud).
    this.providerId = options.providerId || "local";
  }

  /**
   * Enriches the deterministic context facts.
   * NEVER transforms an INFERENCE into a FACT, never invents new facts.
   *
   * Local deterministic scoring: token overlap between the intent and each
   * fact (key + value) maps to a relevance in [0.3, 1]. Zero overlap
   * demotes (0.3) but never drops — dropping is the budget's job.
   * Fully local: no provider call, no I/O.
   *
   * @param {string} intent - The user's raw intent.
   * @param {Array} facts - The deterministically discovered facts.
   * @returns {Promise<Object>} Map of key -> { relevance }.
   */
  async rankAndEnrich(intent, facts) {
    // Fail closed and loud: policy violation must throw, never silently
    // degrade (the try/catch below is only for execution errors).
    if (this.localOnly && this.providerId !== "local") {
      throw new Error("LOCAL_ONLY_VIOLATION: Remote provider/model not permitted under localOnly policy");
    }
    try {
      const intentTokens = new Set(SemanticRanker.tokenize(intent));
      const enrichment = {};
      for (const fact of Array.isArray(facts) ? facts : []) {
        if (!fact || typeof fact.key !== "string") continue;
        const text = `${fact.key.replace(/[._-]+/g, " ")} ${SemanticRanker.factText(fact.value)}`;
        const factTokens = new Set(SemanticRanker.tokenize(text));
        let overlap = 0;
        for (const token of intentTokens) {
          if (factTokens.has(token)) overlap++;
        }
        const ratio = intentTokens.size > 0 ? overlap / intentTokens.size : 0;
        enrichment[fact.key] = { relevance: Math.round((0.3 + 0.7 * Math.min(1, ratio)) * 100) / 100 };
      }
      return enrichment;
    } catch (e) {
      // Semantic enrichment failed, but we must not crash the deterministic flow.
      return {};
    }
  }

  static tokenize(value) {
    return String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter(token => token.length >= 3);
  }

  static factText(value) {
    if (typeof value === "string") return value.slice(0, 2000);
    try {
      return (JSON.stringify(value) ?? "").slice(0, 2000);
    } catch {
      return "";
    }
  }
}

module.exports = { SemanticRanker };
