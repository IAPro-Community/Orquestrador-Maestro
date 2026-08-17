"use strict";

class ProviderAdapter {
  constructor(id) {
    if (new.target === ProviderAdapter) {
      throw new TypeError("ProviderAdapter is an abstract contract");
    }
    if (typeof id !== "string" || id.trim() === "") {
      throw new TypeError("provider adapter id must be a non-empty string");
    }
    this.id = id;
  }

  async detect() { throw new Error("ProviderAdapter.detect must be implemented"); }
  async capabilities() { throw new Error("ProviderAdapter.capabilities must be implemented"); }
  async execute() { throw new Error("ProviderAdapter.execute must be implemented"); }
}

module.exports = { ProviderAdapter };
