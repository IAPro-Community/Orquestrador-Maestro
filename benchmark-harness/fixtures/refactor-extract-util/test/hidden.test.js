const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Refactor - Hidden Tests", () => {
  it("ReportService should import from dateUtils, not duplicate logic", () => {
    const reportService = fs.readFileSync(
      path.join(__dirname, "../src/services/ReportService.js"),
      "utf8"
    );

    assert.ok(
      reportService.includes("require") && reportService.includes("dateUtils"),
      "ReportService should import from dateUtils module"
    );

    const formatDateCount = (reportService.match(/function formatDate/g) || []).length;
    assert.equal(formatDateCount, 0, "ReportService should not define its own formatDate");
  });

  it("dateUtils should export parseDate and daysBetween", () => {
    const dateUtils = fs.readFileSync(
      path.join(__dirname, "../src/utils/dateUtils.js"),
      "utf8"
    );
    assert.ok(dateUtils.includes("parseDate"), "dateUtils should export parseDate");
    assert.ok(dateUtils.includes("daysBetween"), "dateUtils should export daysBetween");
  });
});
