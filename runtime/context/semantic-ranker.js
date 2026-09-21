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
   * NEVER transforms an INFERENCE into a FACT.
   * Returns a map of key -> { relevance, inference, confidence } or similar.
   *
   * @param {string} intent - The user's raw intent.
   * @param {Array} facts - The deterministically discovered facts.
   * @returns {Promise<Object>} Map of enriched data or empty object if failed.
   */
  async rankAndEnrich(intent, facts) {
    // Fail closed and loud: policy violation must throw, never silently
    // degrade (the try/catch below is only for execution errors).
    if (this.localOnly && this.providerId !== "local") {
      throw new Error("LOCAL_ONLY_VIOLATION: Remote provider/model not permitted under localOnly policy");
    }
    try {
      const provider = this.app.providers.get(this.providerId);
      if (!provider) return {};

      // In M1, we simulate or make a very lightweight call.
      // If it times out or crashes, we catch and return {} so we don't break the engine.

      // MOCK implementation for M1 baseline. A real implementation would parse JSON from the LLM.
      // We return an empty object to represent that no inferences were made, preserving deterministic facts.
      return {};
    } catch (e) {
      // Semantic enrichment failed, but we must not crash the deterministic flow.
      return {};
    }
  }
}

module.exports = { SemanticRanker };
