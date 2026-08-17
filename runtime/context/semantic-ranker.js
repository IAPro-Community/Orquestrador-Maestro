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
    // Determine the economy/local provider to use
    this.providerId = "opencode"; // Hardcoded for M1 example, could be resolved dynamically
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
    try {
      const provider = this.app.providers.get(this.providerId);
      if (!provider) return {};

      // If localOnly is true, we should theoretically ensure the provider is local.
      if (this.localOnly && this.providerId !== 'opencode' && this.providerId !== 'local') {
         // Silently refuse to use remote models when localOnly is true.
         return {};
      }

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
