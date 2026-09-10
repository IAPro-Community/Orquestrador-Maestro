const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("Benchmark Metrics", () => {
  const { median, percentile, mean, stddev, confidenceInterval95: ci95 } = require("../benchmarks/harness/metrics");

  describe("median", () => {
    it("should return middle value for odd-length array", () => {
      assert.equal(median([1, 2, 3]), 2);
    });

    it("should return average of two middle values for even-length array", () => {
      assert.equal(median([1, 2, 3, 4]), 2.5);
    });

    it("should handle single element", () => {
      assert.equal(median([5]), 5);
    });

    it("should handle unsorted input", () => {
      assert.equal(median([3, 1, 2]), 2);
    });
  });

  describe("percentile", () => {
    it("should return correct 50th percentile (median)", () => {
      assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
    });

    it("should return correct 90th percentile", () => {
      const arr = Array.from({ length: 100 }, (_, i) => i + 1);
      assert.equal(percentile(arr, 90), 90);
    });

    it("should return correct 0th percentile (min)", () => {
      assert.equal(percentile([1, 2, 3], 0), 1);
    });

    it("should return correct 100th percentile (max)", () => {
      assert.equal(percentile([1, 2, 3], 100), 3);
    });
  });

  describe("mean", () => {
    it("should calculate average", () => {
      assert.equal(mean([1, 2, 3, 4, 5]), 3);
    });

    it("should handle single element", () => {
      assert.equal(mean([42]), 42);
    });

    it("should handle decimal values", () => {
      const result = mean([1.5, 2.5, 3.5]);
      assert.ok(Math.abs(result - 2.5) < 1e-10);
    });
  });

  describe("stddev", () => {
    it("should return 0 for identical values", () => {
      const result = stddev([5, 5, 5, 5]);
      assert.ok(Math.abs(result) < 1e-10);
    });

    it("should calculate standard deviation", () => {
      const result = stddev([1, 2, 3, 4, 5]);
      assert.ok(Math.abs(result - Math.sqrt(2.5)) < 1e-10);
    });

    it("should handle single element", () => {
      const result = stddev([42]);
      assert.equal(result, null);
    });
  });

  describe("ci95", () => {
    it("should return zero-width interval for identical values", () => {
      const result = ci95([5, 5, 5, 5]);
      assert.equal(result.lower, 5);
      assert.equal(result.upper, 5);
    });

    it("should return interval for varying data", () => {
      const result = ci95([1, 2, 3, 4, 5]);
      assert.ok(result.lower < result.upper);
    });

    it("should have margin of approximately 1.96 * stddev / sqrt(n)", () => {
      const data = [10, 20, 30, 40, 50];
      const s = stddev(data);
      const expectedMargin = (1.96 * s) / Math.sqrt(data.length);
      const m = mean(data);
      const result = ci95(data);
      assert.ok(Math.abs((result.upper - m) - expectedMargin) < 1e-10);
    });
  });
});
