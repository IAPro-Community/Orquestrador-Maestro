const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getUserOrderSummary, getAllUserSummaries, getOrdersByStatus } = require("../src/queries");

describe("Investigate Performance - Hidden Tests", () => {
  it("getUserOrderSummary should return null for unknown email", () => {
    const result = getUserOrderSummary("nonexistent@example.com");
    assert.equal(result, null);
  });

  it("getUserOrderSummary should return correct data for known user", () => {
    const result = getUserOrderSummary("alice@example.com");
    assert.ok(result, "Should find alice");
    assert.equal(result.user.name, "Alice");
    assert.ok(result.orderCount >= 0);
  });

  it("getAllUserSummaries should return summaries for all users", () => {
    const summaries = getAllUserSummaries();
    assert.ok(summaries.length > 0, "Should have user summaries");
    assert.ok(summaries.every((s) => s.user && typeof s.orderCount === "number"));
  });

  it("getOrdersByStatus should filter correctly", () => {
    const completed = getOrdersByStatus("completed");
    assert.ok(completed.length >= 0);
    assert.ok(completed.every((o) => o.status === "completed"));
  });
});
