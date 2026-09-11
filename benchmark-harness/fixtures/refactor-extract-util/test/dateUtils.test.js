const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { formatDate, addDays, isWeekend } = require("../src/utils/dateUtils");

describe("dateUtils", () => {
  it("should format date as YYYY-MM-DD", () => {
    const result = formatDate("2024-03-15", "YYYY-MM-DD");
    assert.equal(result, "2024-03-15");
  });

  it("should add days to date", () => {
    const result = addDays("2024-03-15", 5);
    assert.equal(result.getDate(), 20);
  });
});
