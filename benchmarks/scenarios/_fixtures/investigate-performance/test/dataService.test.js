const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getUserOrderSummary, getTotalRevenue } = require("../src/dataService");

describe("dataService", () => {
  it("should get user order summary", () => {
    const summary = getUserOrderSummary("alice@example.com");
    assert.equal(summary.user.name, "Alice");
    assert.equal(summary.orderCount, 2);
  });

  it("should calculate total revenue", () => {
    const revenue = getTotalRevenue();
    assert.ok(revenue > 0);
  });
});
